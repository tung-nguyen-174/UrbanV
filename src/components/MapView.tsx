import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreglWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import * as turf from '@turf/turf';
import type { FeatureCollection, Geometry } from 'geojson';
import { Locate, Plus, Minus, Sun, Moon } from 'lucide-react';
import {
  colorMatchExpression,
  outlineMatchExpression,
  type LandUseCode,
} from '../taxonomy';
import type { PlanningFeature, PlanningFeatureCollection } from '../types';
import { createCentroidLabels, EMPTY_FEATURE_COLLECTION } from '../lib/data';

// Set worker URL explicitly to prevent "Worker failed to load" in Vite and production builds
if (typeof window !== 'undefined') {
  maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
}

interface MapViewProps {
  ward: FeatureCollection<Geometry, { [key: string]: unknown }>;
  features: PlanningFeature[];
  activeCoordinate: [number, number] | null;
  onSelectLocation: (lng: number, lat: number) => void;
  isDarkTheme: boolean;
  onToggleTheme: () => void;
}

const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';

export const MapView: React.FC<MapViewProps> = ({
  ward,
  features,
  activeCoordinate,
  onSelectLocation,
  isDarkTheme,
  onToggleTheme,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

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

  // Set up or update layers & sources
  const setupLayers = useCallback(
    (map: maplibregl.Map) => {
      // 1. Ward Mask (Dimming outside ward)
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

        // Polygon fill
        map.addLayer({
          id: 'features-fill',
          type: 'fill',
          source: 'features-source',
          paint: {
            'fill-color': colorMatchExpression() as any,
            'fill-opacity': 0.25,
          },
        });

        // Polygon outline
        map.addLayer({
          id: 'features-outline',
          type: 'line',
          source: 'features-source',
          paint: {
            'line-color': outlineMatchExpression() as any,
            'line-width': 2,
            'line-opacity': 0.85,
          },
        });
      } else {
        (map.getSource('features-source') as maplibregl.GeoJSONSource).setData(
          visibleFeaturesCollection as any
        );
      }

      // 3. Ward Boundary Outline
      if (!map.getSource('ward-source')) {
        map.addSource('ward-source', {
          type: 'geojson',
          data: ward as any,
        });
        map.addLayer({
          id: 'ward-outline-line',
          type: 'line',
          source: 'ward-source',
          paint: {
            'line-color': '#1E3A8A',
            'line-width': 3,
            'line-dasharray': [3, 1.5],
            'line-opacity': 0.9,
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
            'text-halo-width': 2,
          },
        });
      } else {
        (
          map.getSource('centroid-labels-source') as maplibregl.GeoJSONSource
        ).setData(centroidData as any);
      }
    },
    [features, ward, getMaskGeoJson, isDarkTheme]
  );

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
        compact: true,
        customAttribution: '© OpenStreetMap contributors · OpenFreeMap',
      }),
      'bottom-right'
    );

    mapRef.current = map;

    map.on('load', () => {
      setupLayers(map);

      // Fit map to ward bbox if polygon exists
      try {
        if (ward && ward.features && ward.features.length > 0) {
          const hasPolygons = ward.features.some(
            (f) =>
              f.geometry &&
              (f.geometry.type === 'Polygon' ||
                f.geometry.type === 'MultiPolygon')
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
          }
        }
      } catch (err) {
        console.warn('Error fitting to ward bbox:', err);
      }
    });

    // Handle user tap/click on map
    map.on('click', (e) => {
      onSelectLocation(e.lngLat.lng, e.lngLat.lat);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update layers whenever data (ward or features) changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    setupLayers(map);
  }, [features, ward, setupLayers]);

  // Handle Theme Style Switch
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const targetStyle = isDarkTheme ? DARK_STYLE : LIGHT_STYLE;
    map.setStyle(targetStyle);

    // Re-add sources and layers after style finishes loading
    map.once('style.load', () => {
      setupLayers(map);
    });

    // Fallback if dark style fails
    const errorHandler = () => {
      if (isDarkTheme) {
        console.warn('Dark style failed, falling back to Positron');
        map.setStyle(LIGHT_STYLE);
        map.once('style.load', () => setupLayers(map));
      }
    };
    map.once('error', errorHandler);

    return () => {
      map.off('error', errorHandler);
    };
  }, [isDarkTheme, setupLayers]);

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
          <div class="absolute w-8 h-8 rounded-full bg-rose-500/25 animate-ping"></div>
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

  // Zoom handlers
  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  // "My Location" handler (strictly user-triggered, never sent anywhere)
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      setGeoError('Trình duyệt không hỗ trợ định vị.');
      setTimeout(() => setGeoError(null), 3000);
      return;
    }

    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { longitude, latitude } = pos.coords;
        const map = mapRef.current;
        if (map) {
          map.flyTo({ center: [longitude, latitude], zoom: 16 });
        }
        onSelectLocation(longitude, latitude);
      },
      (err) => {
        setIsLocating(false);
        console.warn('Geolocation error:', err);
        setGeoError('Không thể lấy vị trí hiện tại.');
        setTimeout(() => setGeoError(null), 3000);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      {/* MapLibre WebGL container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Map Controls (Right Side) */}
      <div className="absolute top-20 right-3 z-20 flex flex-col gap-2">
        {/* Zoom Controls */}
        <div className="flex flex-col bg-white/95 dark:bg-[#0B101D]/90 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/80 dark:border-white/12 overflow-hidden">
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Phóng to"
            className="w-11 h-11 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 border-b border-slate-100 dark:border-white/10 transition-colors cursor-pointer"
          >
            <Plus className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Thu nhỏ"
            className="w-11 h-11 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
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
          className="w-11 h-11 flex items-center justify-center bg-white/95 dark:bg-[#0B101D]/90 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/80 dark:border-white/12 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
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
          className="h-11 px-3 flex items-center justify-center gap-1.5 bg-white/95 dark:bg-[#0B101D]/90 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/80 dark:border-white/12 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
        >
          {isDarkTheme ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          <span className="text-sm font-medium whitespace-nowrap">Chế độ tối</span>
        </button>
      </div>

      {/* Geolocation feedback notification */}
      {geoError && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 bg-rose-900/90 text-white text-xs rounded-full shadow-lg backdrop-blur-xs">
          {geoError}
        </div>
      )}
    </div>
  );
};
