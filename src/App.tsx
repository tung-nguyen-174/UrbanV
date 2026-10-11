import React, { useEffect, useState, useMemo, useCallback } from 'react';
import * as turf from '@turf/turf';
import type { FeatureCollection, Geometry } from 'geojson';
import { Bookmark, AlertTriangle, AlertCircle, X, Sparkles, MapPin, Trash2 } from 'lucide-react';
import { COPY, getGroup, type LegendGroupId } from './taxonomy';
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
import { MapView } from './components/MapView';
import { SearchBar } from './components/SearchBar';
import { Legend } from './components/Legend';
import { ResultSheet } from './components/ResultSheet';
import { ReportDialog } from './components/ReportDialog';
import { UrbanVLogo } from './components/UrbanVLogo';

export default function App() {
  // Datasets
  const [ward, setWard] = useState<FeatureCollection<Geometry, { [key: string]: unknown }>>(
    EMPTY_FEATURE_COLLECTION
  );
  const [allFeatures, setAllFeatures] = useState<PlanningFeature[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [adminUnits, setAdminUnits] = useState<AdminUnit[]>([]);
  const [isWardEmpty, setIsWardEmpty] = useState<boolean>(false);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);

  // App settings & Preferences
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(false);
  const [isLargeText, setIsLargeText] = useState<boolean>(() => getLargeTextPref());
  const isDraftPreview = useMemo(() => isPreviewMode(), []);

  // Active query & result state
  const [activeCoordinate, setActiveCoordinate] = useState<[number, number] | null>(null);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);

  // Dialogs
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
  const [isSavedPlacesOpen, setIsSavedPlacesOpen] = useState<boolean>(false);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);

  // Filter features according to publish state & preview mode
  const visibleFeatures = useMemo(() => {
    return filterVisibleFeatures(allFeatures, isDraftPreview);
  }, [allFeatures, isDraftPreview]);

  // Legend groups present in loaded features, with polygon count per group
  const presentGroups = useMemo(() => {
    const counts = new Map<LegendGroupId, number>();
    for (const f of visibleFeatures) {
      const group = getGroup(f.properties?.legend_group);
      if (group) counts.set(group.id, (counts.get(group.id) ?? 0) + 1);
    }
    return Array.from(counts, ([id, count]) => ({ id, count }));
  }, [visibleFeatures]);

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
      setActiveCoordinate([lng, lat]);

      const res = lookup(lng, lat, ward, visibleFeatures, {
        previewMode: isDraftPreview,
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
    [ward, visibleFeatures, isDraftPreview]
  );

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
      setIsWardEmpty(data.wardLoadError);
      setIsLoadingData(false);

      // Check initial URL hash for #lng=...&lat=...
      try {
        const hash = window.location.hash;
        if (hash) {
          const params = new URLSearchParams(hash.replace('#', ''));
          const lng = parseFloat(params.get('lng') || '');
          const lat = parseFloat(params.get('lat') || '');
          if (Number.isFinite(lng) && Number.isFinite(lat)) {
            // Initial coordinate lookup
            const res = lookup(lng, lat, data.ward, data.features.features || [], {
              previewMode: isDraftPreview,
            });
            setActiveCoordinate([lng, lat]);
            setLookupResult(res);
          }
        }
      } catch {
        // Hash parsing fallback
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isDraftPreview]);

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
        <UrbanVLogo variant="primary" size="md" showSubtitle={true} />

        {/* Zone 3: Actions (A+ toggle, Saved places) */}
        <div className="flex items-center gap-2">
          {/* Large text toggle */}
          <button
            type="button"
            onClick={toggleLargeText}
            title={isLargeText ? 'Cỡ chữ bình thường' : 'Phóng to chữ (+25%)'}
            aria-label="Đổi cỡ chữ"
            className={`min-h-[44px] px-3 flex items-center justify-center rounded-xl font-semibold text-xs transition-colors cursor-pointer ${
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
            className="min-h-[44px] px-3 flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs font-medium cursor-pointer"
          >
            <Bookmark className="w-4 h-4" />
            <span className="hidden xs:inline">Đã lưu</span>
          </button>
        </div>
      </header>

      {/* 2. DRAFT BANNER (If ?preview=draft) */}
      {isDraftPreview && (
        <div className="shrink-0 bg-red-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 shadow-sm z-30">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{COPY.draftBannerVi}</span>
        </div>
      )}

      {/* 3. WARD LOAD WARNING (If ward_boundary.geojson is empty) */}
      {isWardEmpty && (
        <div className="shrink-0 bg-amber-500 text-slate-950 px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 z-30">
          <AlertCircle className="w-4 h-4 shrink-0 text-slate-950" />
          <span>Chưa tải được ranh giới phường (bản đồ định vị tạm thời tại trung tâm Thanh Hóa)</span>
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
        </div>

        {/* Legend Overlay (Collapsible) */}
        <div className="absolute bottom-24 left-3 z-20 pointer-events-auto max-w-[280px]">
          <Legend presentGroups={presentGroups} />
        </div>

        {/* Interactive MapView */}
        <MapView
          ward={ward}
          features={visibleFeatures}
          activeCoordinate={activeCoordinate}
          onSelectLocation={runLookupAt}
          isDarkTheme={isDarkTheme}
          onToggleTheme={toggleTheme}
        />
      </main>

      {/* 5. RESULT SHEET (3 SNAP HEIGHTS: COLLAPSED, HALF, FULL) */}
      <ResultSheet
        result={lookupResult}
        documents={documents}
        adminUnits={adminUnits}
        onOpenReport={() => setIsReportOpen(true)}
        onClose={() => setLookupResult(null)}
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
                className="w-10 h-10 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {savedPlaces.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm">
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
                      className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-xl hover:bg-white dark:hover:bg-slate-700 transition-colors"
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
