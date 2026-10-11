import React, { Suspense, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import * as turf from '@turf/turf';
import type { FeatureCollection, Geometry } from 'geojson';
import { Bookmark, AlertTriangle, AlertCircle, X, MapPin, Trash2 } from 'lucide-react';
import { COPY, getGroup, LEGEND_GROUP_IDS, type LegendGroupId } from './taxonomy';
import type {
  AdminUnit,
  DocumentRecord,
  LookupResult,
  PlanningFeature,
  SavedPlace,
} from './types';
import {
  loadAppDatasets,
  filterVisibleFeatures,
  isPreviewMode,
  getLargeTextPref,
  setLargeTextPref,
  getSavedPlaces,
  removeSavedPlaceLocally,
  EMPTY_FEATURE_COLLECTION,
} from './lib/data';
import { lookup } from './lib/lookup';
import { SearchBar } from './components/SearchBar';
import { LayerControls, LegendChips, type LegendItem } from './components/Legend';
import { ResultSheet } from './components/ResultSheet';
import { ReportDialog } from './components/ReportDialog';
import { UrbanVLogo } from './components/UrbanVLogo';

// Stable empty selection, so the map does not re-run its effects on every render
const NO_SELECTION: PlanningFeature[] = [];

// maplibre-gl (about 1 MB) is loaded only when the map is shown, so the search and header paint first
const MapView = React.lazy(() =>
  import('./components/MapView').then((m) => ({ default: m.MapView }))
);

export default function App() {
  // Datasets
  const [ward, setWard] = useState<FeatureCollection<Geometry, { [key: string]: unknown }>>(
    EMPTY_FEATURE_COLLECTION
  );
  const [allFeatures, setAllFeatures] = useState<PlanningFeature[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [adminUnits, setAdminUnits] = useState<AdminUnit[]>([]);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  // Mount the map after the first paint, so the map chunk does not block the search and header
  const [isMapMounted, setIsMapMounted] = useState<boolean>(false);
  useEffect(() => {
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setIsMapMounted(true), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  // Lookups run only when ward, features and documents have all loaded successfully
  const isDataReady = !isLoadingData && loadErrors.length === 0;

  // App settings & Preferences
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(false);
  const [isLargeText, setIsLargeText] = useState<boolean>(() => getLargeTextPref());
  const isDraftPreview = useMemo(() => isPreviewMode(), []);

  // Active query & result state
  const [activeCoordinate, setActiveCoordinate] = useState<[number, number] | null>(null);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  // Height of the result sheet, so the map keeps the tapped block above it
  const [sheetHeight, setSheetHeight] = useState<number>(0);
  // A new lookup replaces the result, so the highlight is replaced with it; no result = no highlight
  const selectedFeatures = lookupResult?.matches ?? NO_SELECTION;

  // Dialogs
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
  const [isSavedPlacesOpen, setIsSavedPlacesOpen] = useState<boolean>(false);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);

  // Filter features according to publish state & preview mode
  const visibleFeatures = useMemo(() => {
    return filterVisibleFeatures(allFeatures, isDraftPreview);
  }, [allFeatures, isDraftPreview]);

  // Legend: groups present in loaded features, each with its share of the ward's area.
  // The ward area is the sum of its polygons; overlapping plan polygons are counted twice.
  const wardAreaM2 = useMemo(() => {
    let total = 0;
    for (const f of ward.features ?? []) {
      if (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') total += turf.area(f as any);
    }
    return total;
  }, [ward]);
  const legendItems = useMemo<LegendItem[]>(() => {
    const areas = new Map<LegendGroupId, number>();
    for (const f of visibleFeatures) {
      const group = getGroup(f.properties?.legend_group);
      if (!group) continue;
      areas.set(group.id, (areas.get(group.id) ?? 0) + turf.area(f as any));
    }
    return LEGEND_GROUP_IDS.filter((id) => areas.has(id)).map((id) => ({
      id,
      areaPct: wardAreaM2 > 0 ? ((areas.get(id) ?? 0) / wardAreaM2) * 100 : 0,
    }));
  }, [visibleFeatures, wardAreaM2]);

  // Legend controls. Every group is on by default; the user switches groups off.
  const [hiddenGroups, setHiddenGroups] = useState<LegendGroupId[]>([]);
  const activeGroups = useMemo(
    () => LEGEND_GROUP_IDS.filter((id) => !hiddenGroups.includes(id)),
    [hiddenGroups]
  );
  const toggleGroup = useCallback((id: LegendGroupId) => {
    setHiddenGroups((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);
  const [fillOpacity, setFillOpacity] = useState<number>(0.35);
  const [showPatterns, setShowPatterns] = useState<boolean>(false);
  // Reviewer view: outlines only. Held in memory only, so it resets on reload.
  const [outlineOnly, setOutlineOnly] = useState<boolean>(false);

  // Ward bounding box for search viewbox constraint
  const wardBbox = useMemo<[number, number, number, number] | null>(() => {
    try {
      if (ward && ward.features && ward.features.length > 0) {
        const hasPolygons = ward.features.some(
          (f) =>
            f.geometry &&
            (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
        );
        if (hasPolygons) {
          const b = turf.bbox(ward);
          return [b[0], b[1], b[2], b[3]];
        }
      }
    } catch {
      // Fallback
    }
    return null;
  }, [ward]);

  // Execute lookup
  const runLookupAt = useCallback(
    (lng: number, lat: number) => {
      // Never answer from empty or partially loaded data
      if (!isDataReady) return;

      setActiveCoordinate([lng, lat]);

      const res = lookup(lng, lat, ward, visibleFeatures, {
        previewMode: isDraftPreview,
        documents,
      });
      setLookupResult(res);

      // Sync URL hash
      try {
        const hash = `#lng=${lng.toFixed(6)}&lat=${lat.toFixed(6)}`;
        if (window.location.hash !== hash) {
          window.history.replaceState(null, '', hash);
        }
      } catch {
        // Ignore history errors
      }
    },
    [ward, visibleFeatures, documents, isDraftPreview, isDataReady]
  );

  // MapView registers its click handler once, so route taps through a ref to the latest runLookupAt
  const runLookupRef = useRef(runLookupAt);
  runLookupRef.current = runLookupAt;
  const handleMapSelect = useCallback((lng: number, lat: number) => {
    runLookupRef.current(lng, lat);
  }, []);

  // Initial data loading
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoadingData(true);
      const data = await loadAppDatasets();
      if (!isMounted) return;

      setWard(data.ward);
      setAllFeatures(data.features.features || []);
      setDocuments(data.documents);
      setAdminUnits(data.adminUnits);
      setLoadErrors(data.loadErrors);
      setIsLoadingData(false);
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isDraftPreview]);

  // Shared link #lng=...&lat=...: look it up once, after all data is ready
  const didHashLookupRef = useRef(false);
  useEffect(() => {
    if (!isDataReady || didHashLookupRef.current) return;
    didHashLookupRef.current = true;
    try {
      const params = new URLSearchParams(window.location.hash.replace('#', ''));
      const lng = parseFloat(params.get('lng') || '');
      const lat = parseFloat(params.get('lat') || '');
      if (Number.isFinite(lng) && Number.isFinite(lat)) runLookupAt(lng, lat);
    } catch {
      // Hash parsing fallback
    }
  }, [isDataReady, runLookupAt]);

  // Toggle large text
  const toggleLargeText = () => {
    const next = !isLargeText;
    setIsLargeText(next);
    setLargeTextPref(next);
  };

  // Toggle dark/light theme
  const toggleTheme = () => {
    setIsDarkTheme((prev) => !prev);
  };

  // Open saved places modal
  const handleOpenSavedPlaces = () => {
    setSavedPlaces(getSavedPlaces());
    setIsSavedPlacesOpen(true);
  };

  const handleSelectSavedPlace = (place: SavedPlace) => {
    setIsSavedPlacesOpen(false);
    runLookupAt(place.lng, place.lat);
  };

  const handleDeleteSavedPlace = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeSavedPlaceLocally(id);
    setSavedPlaces(getSavedPlaces());
  };

  return (
    <div
      className={`w-full h-[100dvh] flex flex-col overflow-hidden font-sans transition-colors ${
        isDarkTheme ? 'dark bg-[#0B101D] text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
      style={{
        fontSize: isLargeText ? '125%' : '100%',
      }}
    >
      {/* 1. TOP HEADER BAR */}
      <header className="shrink-0 z-30 bg-white/95 dark:bg-[#0B101D]/90 backdrop-blur-xl border-b border-slate-200/90 dark:border-white/10 px-4 py-2.5 flex items-center justify-between">
        {/* Zone 1: Brand title & logo */}
        <h1 className="sr-only">UrbanV: tra cứu quy hoạch Phường Hạc Thành</h1>
        <UrbanVLogo variant="primary" size="md" showSubtitle={true} />

        {/* Zone 3: Actions (A+ toggle, Saved places) */}
        <div className="flex items-center gap-2">
          {/* Large text toggle */}
          <button
            type="button"
            onClick={toggleLargeText}
            title={isLargeText ? 'Cỡ chữ bình thường' : 'Phóng to chữ (+25%)'}
            aria-label={isLargeText ? 'A+ Cỡ chữ bình thường' : 'A+ Phóng to chữ (+25%)'}
            aria-pressed={isLargeText}
            className={`min-h-[48px] min-w-[48px] px-3 flex items-center justify-center rounded-xl font-semibold text-sm transition-colors cursor-pointer ${
              isLargeText
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span>A+</span>
          </button>

          {/* Saved Places */}
          <button
            type="button"
            onClick={handleOpenSavedPlaces}
            title="Địa điểm đã lưu"
            aria-label="Địa điểm đã lưu"
            className="min-h-[48px] min-w-[48px] px-3 flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm font-medium cursor-pointer"
          >
            <Bookmark className="w-4 h-4" />
            <span className="hidden xs:inline">Đã lưu</span>
          </button>
        </div>
      </header>

      {/* 2. DRAFT BANNER (If ?preview=draft) */}
      {isDraftPreview && (
        <aside aria-label="Cảnh báo bản nháp" className="shrink-0 bg-red-600 text-white px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2 shadow-sm z-30">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{COPY.draftBannerVi}</span>
        </aside>
      )}

      {/* 3. DATA LOAD ERROR (lookups stay disabled until a reload succeeds) */}
      {loadErrors.length > 0 && (
        <div
          role="alert"
          className="shrink-0 bg-amber-500 text-slate-950 px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 z-30"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-slate-950" />
          <span>
            Không tải được dữ liệu ({loadErrors.join(', ')}). Chưa thể tra cứu, hãy tải lại trang.
          </span>
        </div>
      )}

      {/* 4. MAIN MAP CANVAS AREA WITH FLOATING SEARCH & CONTROLS */}
      <main className="relative flex-1 w-full h-full overflow-hidden">
        {/* Floating Search Bar and Permanent Pilot Badge */}
        <div className="absolute top-2.5 left-2 right-2 sm:top-3 sm:left-4 sm:right-auto sm:w-[440px] z-20 flex flex-col gap-1.5 pointer-events-auto">
          <SearchBar
            wardBbox={wardBbox}
            onSelectCoordinate={(lng, lat) => runLookupAt(lng, lat)}
          />

          {/* Permanent pilot badge */}
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-slate-200/70 dark:border-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            <span className="truncate">{COPY.pilotBadgeVi}</span>
          </div>

          {/* Legend chips: toggle each colour group on the map */}
          <LegendChips
            items={legendItems}
            activeGroups={activeGroups}
            onToggle={toggleGroup}
            previewDraft={isDraftPreview}
          />

          {isLoadingData && (
            <div
              role="status"
              className="self-start bg-slate-900/85 text-white px-3.5 py-1.5 rounded-xl text-sm font-medium shadow-xs"
            >
              Đang tải dữ liệu…
            </div>
          )}
        </div>

        {/* Layer controls (collapsible) above the bottom sheet's peek height */}
        <aside aria-label="Hiển thị bản đồ" className="absolute bottom-24 left-3 z-20 pointer-events-auto flex flex-col items-start gap-2">
          {/* Reviewer view (preview only): compare edges with the source document. Not persisted. */}
          {isDraftPreview && (
            <button
              type="button"
              aria-pressed={outlineOnly}
              onClick={() => setOutlineOnly((v) => !v)}
              className={`min-h-[48px] px-4 rounded-2xl border shadow-xl text-sm font-medium cursor-pointer ${
                outlineOnly
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white/95 text-slate-800 border-slate-200/90'
              }`}
            >
              Chỉ viền
            </button>
          )}
          <LayerControls
            fillOpacity={fillOpacity}
            onOpacityChange={(v) => setFillOpacity(Math.min(0.8, Math.max(0.1, v)))}
            showPatterns={showPatterns}
            onPatternsChange={setShowPatterns}
          />
        </aside>

        {/* Interactive MapView */}
        <Suspense
          fallback={
            <div role="status" className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-[#0B101D] text-slate-700 dark:text-slate-300 text-sm">
              Đang tải bản đồ…
            </div>
          }
        >
          {isMapMounted && (
            <MapView
              ward={ward}
              features={visibleFeatures}
              selectedFeatures={selectedFeatures}
              activeCoordinate={activeCoordinate}
              bottomPadding={sheetHeight}
              activeGroups={activeGroups}
              fillOpacity={fillOpacity}
              showPatterns={showPatterns}
              previewDraft={isDraftPreview}
              outlineOnly={outlineOnly}
              onSelectLocation={handleMapSelect}
              isDarkTheme={isDarkTheme}
              onToggleTheme={toggleTheme}
            />
          )}
        </Suspense>
      </main>

      {/* 5. RESULT SHEET (3 SNAP HEIGHTS: COLLAPSED, HALF, FULL) */}
      <ResultSheet
        result={lookupResult}
        documents={documents}
        adminUnits={adminUnits}
        onOpenReport={() => setIsReportOpen(true)}
        onClose={() => setLookupResult(null)}
        onHeightChange={setSheetHeight}
      />

      {/* 6. REPORT DIALOG */}
      {lookupResult && (
        <ReportDialog
          isOpen={isReportOpen}
          onClose={() => setIsReportOpen(false)}
          lng={lookupResult.lng}
          lat={lookupResult.lat}
          matches={lookupResult.matches}
        />
      )}

      {/* 7. SAVED PLACES DRAWER / MODAL */}
      {isSavedPlacesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#0B101D] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/12 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Địa điểm đã lưu ({savedPlaces.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSavedPlacesOpen(false)}
                className="w-10 h-10 flex items-center justify-center rounded-full text-slate-600 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {savedPlaces.length === 0 ? (
                <div className="py-8 text-center text-slate-600 text-sm">
                  Chưa có vị trí nào được lưu trên thiết bị này.
                </div>
              ) : (
                savedPlaces.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleSelectSavedPlace(p)}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {p.label}
                        </h4>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        {p.lng.toFixed(5)}, {p.lat.toFixed(5)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSavedPlace(p.id, e)}
                      aria-label="Xóa địa điểm đã lưu"
                      className="w-9 h-9 flex items-center justify-center text-slate-600 hover:text-rose-600 rounded-xl hover:bg-white dark:hover:bg-slate-700 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
