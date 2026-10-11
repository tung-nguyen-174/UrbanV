import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreglWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import * as turf from '@turf/turf';
import type { FeatureCollection, Geometry } from 'geojson';
import { Locate, Plus, Minus, Sun, Moon } from 'lucide-react';
import {
  featureTitleVi,
  fillColorExpression,
  LEGEND_GROUP_IDS,
  LEGEND_GROUPS,
  outlineColorExpression,
  type LegendGroupId,
  type PatternId,
} from '../taxonomy';
import type { PlanningFeature, PlanningFeatureCollection } from '../types';
import { createCentroidLabels, EMPTY_FEATURE_COLLECTION } from '../lib/data';

// Set worker URL explicitly to prevent "Worker failed to load" in Vite and production builds
if (typeof window !== 'undefined') {
  maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
}

/** Plan layers that take the group filter and the publishable filter. */
const PLAN_LAYERS = ['features-fill', 'features-outline-halo', 'features-outline'];
const PATTERN_IDS: PatternId[] = [
  'solid', 'diagonal', 'dots', 'cross', 'horizontal', 'vertical', 'grid', 'waves', 'diamond',
];
const patternLayerId = (id: LegendGroupId) => `features-pattern-${id}`;

/** Draws one small repeating tile for a legend pattern (used with map.addImage). */
function drawPatternTile(pattern: PatternId): ImageData {
  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  switch (pattern) {
    case 'solid':
      ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
      ctx.fillRect(0, 0, size, size);
      break;
    case 'diagonal':
      for (let k = -size; k <= size; k += 8) line(k, 0, k + size, size);
      break;
    case 'dots':
      for (const [x, y] of [[6, 6], [18, 18], [18, 6], [6, 18]]) {
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'cross':
      line(12, 0, 12, size);
      line(0, 12, size, 12);
      break;
    case 'horizontal':
      line(0, 6, size, 6);
      line(0, 18, size, 18);
      break;
    case 'vertical':
      line(6, 0, 6, size);
      line(18, 0, 18, size);
      break;
    case 'grid':
      line(0, 0, size, 0);
      line(0, 0, 0, size);
      break;
    case 'waves':
      for (const y of [6, 18]) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.quadraticCurveTo(6, y - 4, 12, y);
        ctx.quadraticCurveTo(18, y + 4, 24, y);
        ctx.stroke();
      }
      break;
    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(12, 2);
      ctx.lineTo(22, 12);
      ctx.lineTo(12, 22);
      ctx.lineTo(2, 12);
      ctx.closePath();
      ctx.stroke();
      break;
  }
  return ctx.getImageData(0, 0, size, size);
}

/** Adds the pattern images once per style (a style change clears them). */
function ensurePatternImages(map: maplibregl.Map) {
  for (const p of PATTERN_IDS) {
    const name = `pattern-${p}`;
    if (!map.hasImage(name)) map.addImage(name, drawPatternTile(p), { pixelRatio: 2 });
  }
}

interface MapViewProps {
  ward: FeatureCollection<Geometry, { [key: string]: unknown }>;
  features: PlanningFeature[];
  /** Legend groups switched on; the others are hidden on the map. */
  activeGroups: LegendGroupId[];
  /** Fill opacity from the slider (0.1 to 0.8). */
  fillOpacity: number;
  /** Show the pattern fill above the solid fill. */
  showPatterns: boolean;
  /** Preview mode also shows draft features. */
  previewDraft: boolean;
  /** Features matched by the last lookup, drawn as a highlight. */
  selectedFeatures: PlanningFeature[];
  activeCoordinate: [number, number] | null;
  /** Height in px of the bottom result sheet; the map keeps content above it. */
  bottomPadding: number;
  onSelectLocation: (lng: number, lat: number) => void;
  isDarkTheme: boolean;
  onToggleTheme: () => void;
}

const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';

export const MapView: React.FC<MapViewProps> = ({
  ward,
  features,
  selectedFeatures,
  activeCoordinate,
  bottomPadding,
  activeGroups,
  fillOpacity,
  showPatterns,
  previewDraft,
  onSelectLocation,
  isDarkTheme,
  onToggleTheme,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  // Desktop hover tooltip (pointer: fine only)
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

  // Helper to compute mask
  const getMaskGeoJson = useCallback(() => {
    try {
      if (!ward || !ward.features || ward.features.length === 0) {
        return EMPTY_FEATURE_COLLECTION;
      }
      const polygons = ward.features.filter(
        (f) =>
          f.geometry &&
          (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
      );
      if (polygons.length === 0) return EMPTY_FEATURE_COLLECTION;
      const mask = turf.mask(turf.featureCollection(polygons as any) as any);
      return mask;
    } catch (err) {
      console.warn('turf.mask computation skipped:', err);
      return EMPTY_FEATURE_COLLECTION;
    }
  }, [ward]);

  // Live layer controls: group filter, fill opacity, pattern layers. Read through a ref so
  // map handlers and setupLayers always see the current values.
  const controlsRef = useRef({ activeGroups, fillOpacity, showPatterns, previewDraft, hasSelection: false });
  controlsRef.current = {
    activeGroups,
    fillOpacity,
    showPatterns,
    previewDraft,
    hasSelection: selectedFeatures.length > 0,
  };

  const applyLayerControls = useCallback((map: maplibregl.Map) => {
    const c = controlsRef.current;
    const statuses = c.previewDraft ? ['approved', 'reviewed', 'draft'] : ['approved'];
    // Publishable filter (as in filterVisibleFeatures), combined with the group filter
    const publishable = ['in', ['get', 'review_status'], ['literal', statuses]];
    const groupOn = ['in', ['get', 'legend_group'], ['literal', c.activeGroups]];

    for (const id of PLAN_LAYERS) {
      if (map.getLayer(id)) map.setFilter(id, ['all', publishable, groupOn] as any);
    }

    // Selected blocks stand out: the plain fill steps back to 0.2 while something is selected
    if (map.getLayer('features-fill')) {
      map.setPaintProperty(
        'features-fill',
        'fill-opacity',
        c.hasSelection
          ? 0.2
          : (['step', ['zoom'], Math.min(0.8, c.fillOpacity + 0.15), 13, c.fillOpacity] as any)
      );
    }

    for (const id of LEGEND_GROUP_IDS) {
      const layerId = patternLayerId(id);
      if (!map.getLayer(layerId)) continue;
      map.setFilter(layerId, ['all', ['==', ['get', 'legend_group'], id], publishable, groupOn] as any);
      const on = c.showPatterns && c.activeGroups.includes(id);
      map.setLayoutProperty(layerId, 'visibility', on ? 'visible' : 'none');
    }
  }, []);

  // Set up or update layers & sources
  const setupLayers = useCallback(
    (map: maplibregl.Map) => {
      // Plan layers go under the basemap's roads and labels, so no polygon hides a street name.
      // Looked up from the current style every time, because light, dark and fallback styles differ.
      const styleLayers = map.getStyle()?.layers ?? [];
      const firstRoad = styleLayers.find(
        (l) => l.type === 'line' && /road|highway|street|transport|bridge|tunnel/i.test(l.id)
      );
      const firstSymbol = styleLayers.find((l) => l.type === 'symbol');
      const planBeforeId = firstRoad?.id ?? firstSymbol?.id;

      // 1. Ward Mask (Dimming outside ward). Added first and never placed under the plan layers.
      // Note: no beforeId, so it sits above the basemap roads too (dims roads outside the ward).
      const maskData = getMaskGeoJson();
      if (!map.getSource('ward-mask-source')) {
        map.addSource('ward-mask-source', {
          type: 'geojson',
          data: maskData as any,
        });
        map.addLayer({
          id: 'ward-mask-fill',
          type: 'fill',
          source: 'ward-mask-source',
          paint: {
            'fill-color': isDarkTheme ? '#020617' : '#0f172a',
            'fill-opacity': isDarkTheme ? 0.45 : 0.32,
          },
        });
      } else {
        (map.getSource('ward-mask-source') as maplibregl.GeoJSONSource).setData(
          maskData as any
        );
      }

      // 2. Planning Features (Fill & Outline)
      const visibleFeaturesCollection: PlanningFeatureCollection = {
        type: 'FeatureCollection',
        features,
      };

      if (!map.getSource('features-source')) {
        map.addSource('features-source', {
          type: 'geojson',
          data: visibleFeaturesCollection as any,
        });

        // Polygon fill: lighter below zoom 13, where blocks are small
        map.addLayer(
          {
            id: 'features-fill',
            type: 'fill',
            source: 'features-source',
            paint: {
              'fill-color': fillColorExpression() as any,
              'fill-opacity': ['step', ['zoom'], 0.5, 13, 0.35] as any,
            },
          },
          planBeforeId
        );

        // White halo under the outline, so the edge reads on any fill colour
        map.addLayer(
          {
            id: 'features-outline-halo',
            type: 'line',
            source: 'features-source',
            paint: {
              'line-color': '#FFFFFF',
              'line-width': 2.5,
              'line-opacity': 0.9,
            },
          },
          planBeforeId
        );

        // Thin outline in the legend group colour
        map.addLayer(
          {
            id: 'features-outline',
            type: 'line',
            source: 'features-source',
            paint: {
              'line-color': outlineColorExpression() as any,
              'line-width': 1,
            },
          },
          planBeforeId
        );
      } else {
        (map.getSource('features-source') as maplibregl.GeoJSONSource).setData(
          visibleFeaturesCollection as any
        );
      }

      // 2b. Selection highlight: all features matched by the last lookup
      const hasSelection = selectedFeatures.length > 0;
      const selectionCollection: PlanningFeatureCollection = {
        type: 'FeatureCollection',
        features: selectedFeatures,
      };
      if (!map.getSource('selection-source')) {
        map.addSource('selection-source', {
          type: 'geojson',
          data: selectionCollection as any,
        });
        map.addLayer(
          {
            id: 'selection-fill',
            type: 'fill',
            source: 'selection-source',
            paint: {
              'fill-color': fillColorExpression() as any,
              'fill-opacity': 0.65,
            },
          },
          planBeforeId
        );
        map.addLayer(
          {
            id: 'selection-halo',
            type: 'line',
            source: 'selection-source',
            paint: { 'line-color': '#FFFFFF', 'line-width': 7 },
          },
          planBeforeId
        );
        map.addLayer(
          {
            id: 'selection-line',
            type: 'line',
            source: 'selection-source',
            paint: { 'line-color': '#191E3C', 'line-width': 4 },
          },
          planBeforeId
        );
      } else {
        (map.getSource('selection-source') as maplibregl.GeoJSONSource).setData(
          selectionCollection as any
        );
      }
      // 2c. Pattern layers, one per legend group, above the solid fill. Each has a group filter
      // and is hidden until the pattern toggle is on.
      ensurePatternImages(map);
      for (const id of LEGEND_GROUP_IDS) {
        if (map.getLayer(patternLayerId(id))) continue;
        map.addLayer(
          {
            id: patternLayerId(id),
            type: 'fill',
            source: 'features-source',
            layout: { visibility: 'none' },
            paint: {
              'fill-pattern': `pattern-${LEGEND_GROUPS[id].pattern}`,
              'fill-opacity': 0.9,
            },
          } as any,
          'features-outline-halo'
        );
      }

      // 3. Ward Boundary Outline
      if (!map.getSource('ward-source')) {
        map.addSource('ward-source', {
          type: 'geojson',
          data: ward as any,
        });
        // Ward outline: solid dark blue with a white halo; always above the plan layers
        map.addLayer({
          id: 'ward-outline-halo',
          type: 'line',
          source: 'ward-source',
          paint: {
            'line-color': '#FFFFFF',
            'line-width': 5,
            'line-opacity': 0.9,
          },
        });
        map.addLayer({
          id: 'ward-outline-line',
          type: 'line',
          source: 'ward-source',
          paint: {
            'line-color': '#1E3A8A',
            'line-width': 2.5,
            'line-opacity': 0.95,
          },
        });
      } else {
        (map.getSource('ward-source') as maplibregl.GeoJSONSource).setData(
          ward as any
        );
      }

      // 4. Centroid Labels for Land-use Codes
      const centroidData = createCentroidLabels(features);
      if (!map.getSource('centroid-labels-source')) {
        map.addSource('centroid-labels-source', {
          type: 'geojson',
          data: centroidData as any,
        });
        map.addLayer({
          id: 'centroid-labels-layer',
          type: 'symbol',
          source: 'centroid-labels-source',
          minzoom: 14.5,
          layout: {
            'text-field': ['get', 'label'],
            'text-size': 12,
            'text-anchor': 'center',
            'text-allow-overlap': false,
            'text-font': ['Noto Sans Regular'],
          },
          paint: {
            'text-color': isDarkTheme ? '#F8FAFC' : '#0F172A',
            'text-halo-color': isDarkTheme ? '#020617' : '#FFFFFF',
            'text-halo-width': 1.5,
          },
        });
      } else {
        (
          map.getSource('centroid-labels-source') as maplibregl.GeoJSONSource
        ).setData(centroidData as any);
      }

      // Re-apply the live controls (group filter, opacity, patterns) to the new layers
      applyLayerControls(map);
    },
    [features, selectedFeatures, ward, getMaskGeoJson, isDarkTheme, applyLayerControls]
  );
  // Map event handlers registered once must call the latest setupLayers, not a stale closure
  const setupLayersRef = useRef(setupLayers);
  setupLayersRef.current = setupLayers;
  const hasFitWardRef = useRef(false);
  const isFirstThemeRunRef = useRef(true);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialStyle = isDarkTheme ? DARK_STYLE : LIGHT_STYLE;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: initialStyle,
      center: [105.776, 19.807], // Thanh Hóa center default
      zoom: 13,
      attributionControl: false,
    });

    // Custom attribution control (position bottom-right)
    map.addControl(
      new maplibregl.AttributionControl({
        compact: false,
        customAttribution: '© OpenStreetMap contributors · OpenFreeMap',
      }),
      'bottom-right'
    );

    mapRef.current = map;

    map.on('load', () => {
      setupLayersRef.current(map);
    });

    // Handle user tap/click on map
    map.on('click', (e) => {
      onSelectLocation(e.lngLat.lng, e.lngLat.lat);
    });

    // Desktop only: pointer cursor and a small title tooltip over plan polygons.
    // Touch devices get no hover behaviour.
    if (window.matchMedia('(pointer: fine)').matches) {
      map.on('mousemove', (e) => {
        if (!map.getLayer('features-fill')) return;
        const hits = map.queryRenderedFeatures(e.point, { layers: ['features-fill'] });
        map.getCanvas().style.cursor = hits.length ? 'pointer' : '';
        setHover(
          hits.length
            ? { x: e.point.x, y: e.point.y, text: featureTitleVi(hits[0].properties as any) }
            : null
        );
      });
      map.on('mouseout', () => {
        map.getCanvas().style.cursor = '';
        setHover(null);
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update layers whenever data (ward or features) changes.
  // isStyleLoaded() stays false until all basemap tiles are in, so retry on 'idle'.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      setupLayers(map);
      return;
    }
    const apply = () => setupLayers(map);
    map.once('idle', apply);
    return () => {
      map.off('idle', apply);
    };
  }, [setupLayers]);

  // Fit map to ward bbox once the ward polygon has loaded
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasFitWardRef.current) return;
    try {
      const hasPolygons = ward?.features?.some(
        (f) =>
          f.geometry &&
          (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
      );
      if (hasPolygons) {
        const bbox = turf.bbox(ward);
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 48, maxZoom: 16 }
        );
        hasFitWardRef.current = true;
      }
    } catch (err) {
      console.warn('Error fitting to ward bbox:', err);
    }
  }, [ward]);

  // Handle Theme Style Switch (skipped on mount: the map is created with the right style)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (isFirstThemeRunRef.current) {
      isFirstThemeRunRef.current = false;
      return;
    }

    const targetStyle = isDarkTheme ? DARK_STYLE : LIGHT_STYLE;
    map.setStyle(targetStyle);

    // Re-add sources and layers after style finishes loading
    map.once('style.load', () => {
      setupLayersRef.current(map);
    });

    // Fallback if dark style fails
    const errorHandler = () => {
      if (isDarkTheme) {
        console.warn('Dark style failed, falling back to Positron');
        map.setStyle(LIGHT_STYLE);
        map.once('style.load', () => setupLayersRef.current(map));
      }
    };
    map.once('error', errorHandler);

    return () => {
      map.off('error', errorHandler);
    };
  }, [isDarkTheme]);

  // Sync active coordinate marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!activeCoordinate) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    const [lng, lat] = activeCoordinate;

    if (!markerRef.current) {
      // Create custom DOM element for clean marker
      const el = document.createElement('div');
      el.className = 'marker-pin-wrap flex items-center justify-center';
      el.innerHTML = `
        <div class="relative flex items-center justify-center w-8 h-8">
          <div class="absolute w-8 h-8 rounded-full bg-rose-500/25 motion-safe:animate-ping"></div>
          <div class="w-4 h-4 rounded-full bg-rose-600 border-2 border-white shadow-md"></div>
        </div>
      `;

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map);
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([lng, lat]);
    }
  }, [activeCoordinate]);

  // Changing the group filter, opacity or patterns updates the layers without rebuilding them
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyLayerControls(map);
  }, [activeGroups, fillOpacity, showPatterns, previewDraft, selectedFeatures, applyLayerControls]);

  // Keep the tapped point and its matched block above the bottom sheet.
  // With a selection: fit to the selected blocks and the tapped point (zoom at most 17).
  // With only a tap: centre on the tapped point. Otherwise: just apply the padding.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Top inset clears the search card, pilot badge and legend chips, which sit over the map's top edge
    const topInset = window.innerWidth < 640 ? 240 : 200;
    const viewPadding = { top: topInset, left: 0, right: 0, bottom: bottomPadding };

    const apply = () => {
      if (selectedFeatures.length > 0) {
        const parts: any[] = [...selectedFeatures];
        if (activeCoordinate) parts.push(turf.point(activeCoordinate));
        const bbox = turf.bbox(turf.featureCollection(parts as any));
        const camera = map.cameraForBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: { top: topInset + 16, left: 32, right: 32, bottom: bottomPadding + 32 } }
        );
        if (camera) {
          map.easeTo({
            center: camera.center,
            zoom: Math.min(camera.zoom ?? map.getZoom(), 17),
            padding: viewPadding,
            duration: 300,
          });
          return;
        }
      }
      if (activeCoordinate) {
        map.easeTo({ center: activeCoordinate, padding: viewPadding, duration: 300 });
        return;
      }
      map.easeTo({ padding: viewPadding, duration: 300 });
    };

    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    map.once('idle', apply);
    return () => {
      map.off('idle', apply);
    };
  }, [bottomPadding, selectedFeatures, activeCoordinate]);

  // Zoom handlers
  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  // "My Location": requested only when the button is pressed. The position is used once
  // for the lookup and is not kept in state, storage or any request.
  const showGeoError = (msg: string) => {
    setGeoError(msg);
    setTimeout(() => setGeoError(null), 6000);
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      showGeoError('Trình duyệt này không hỗ trợ định vị.');
      return;
    }

    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { longitude, latitude } = pos.coords;
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 16 });
        // Outside the ward, the lookup answers with COPY.outOfPilotVi in the result sheet
        onSelectLocation(longitude, latitude);
      },
      (err) => {
        setIsLocating(false);
        // GeolocationPositionError codes: 1 = denied, 2 = unavailable, 3 = timeout
        if (err.code === err.PERMISSION_DENIED) {
          showGeoError('Bạn chưa cho phép truy cập vị trí. Hãy bật quyền vị trí cho trang này trong cài đặt trình duyệt.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          showGeoError('Không xác định được vị trí hiện tại. Thử lại ở nơi có tín hiệu tốt hơn.');
        } else if (err.code === err.TIMEOUT) {
          showGeoError('Lấy vị trí mất quá lâu. Vui lòng thử lại.');
        } else {
          showGeoError('Không thể lấy vị trí hiện tại.');
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      {/* MapLibre WebGL container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Map Controls (Right Side) */}
      <nav aria-label="Điều khiển bản đồ" className="absolute top-[340px] right-3 z-20 flex flex-col gap-2">
        {/* Zoom Controls */}
        <div className="flex flex-col bg-white/95 dark:bg-[#0B101D]/90 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/80 dark:border-white/12 overflow-hidden">
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Phóng to"
            className="w-12 h-12 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 border-b border-slate-100 dark:border-white/10 transition-colors cursor-pointer"
          >
            <Plus className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Thu nhỏ"
            className="w-12 h-12 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Minus className="w-5 h-5" />
          </button>
        </div>

        {/* My Location Button */}
        <button
          type="button"
          onClick={handleLocateMe}
          disabled={isLocating}
          aria-label="Vị trí của tôi"
          className="w-12 h-12 flex items-center justify-center bg-white/95 dark:bg-[#0B101D]/90 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/80 dark:border-white/12 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Locate
            className={`w-5 h-5 ${isLocating ? 'animate-spin text-teal-500' : ''}`}
          />
        </button>

        {/* Theme Toggle (Light / Dark) */}
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label="Chế độ tối"
          aria-pressed={isDarkTheme}
          className="h-12 px-3 flex items-center justify-center gap-1.5 bg-white/95 dark:bg-[#0B101D]/90 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/80 dark:border-white/12 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
        >
          {isDarkTheme ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          <span className="text-sm font-medium whitespace-nowrap">Chế độ tối</span>
        </button>
      </nav>

      {/* Desktop hover tooltip: the plan block's title */}
      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-30 px-2.5 py-1 rounded-md bg-slate-900/90 text-white text-sm shadow-lg max-w-[260px]"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          {hover.text}
        </div>
      )}

      {/* Geolocation feedback notification */}
      {geoError && (
        <div role="status" className="absolute top-24 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 bg-rose-900/90 text-white text-sm rounded-full shadow-lg backdrop-blur-xs">
          {geoError}
        </div>
      )}
    </div>
  );
};
