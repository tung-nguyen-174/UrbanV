import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Geometry, Point, Polygon, MultiPolygon } from 'geojson';
import { isPublishable, mapLabel } from '../taxonomy';
import type {
  AdminUnit,
  DocumentRecord,
  PlanningFeature,
  PlanningFeatureCollection,
  SavedPlace,
} from '../types';

export const EMPTY_FEATURE_COLLECTION: FeatureCollection<Geometry, { [key: string]: unknown }> = {
  type: 'FeatureCollection',
  features: [],
};

/**
 * Checks if the URL has ?preview=draft or preview mode query param.
 */
export function isPreviewMode(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('preview') === 'draft';
}

/**
 * Safely fetches a JSON or GeoJSON resource with fallback.
 */
export async function safeFetchJson<T>(
  url: string,
  fallback: T,
  onError?: (url: string) => void
): Promise<T> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`[UrbanV Data] Fetch ${url} returned ${res.status}`);
      onError?.(url);
      return fallback;
    }
    const data = await res.json();
    return data as T;
  } catch (err) {
    console.warn(`[UrbanV Data] Failed to fetch ${url}:`, err);
    onError?.(url);
    return fallback;
  }
}

/**
 * Loads all initial datasets.
 * `loadErrors` lists the files that failed to load or had the wrong shape; the
 * lookup must not run while it is non-empty (it would answer from empty data).
 */
export async function loadAppDatasets(): Promise<{
  ward: FeatureCollection<Geometry, { [key: string]: unknown }>;
  features: PlanningFeatureCollection;
  documents: DocumentRecord[];
  adminUnits: AdminUnit[];
  wardLoadError: boolean;
  loadErrors: string[];
}> {
  const loadErrors: string[] = [];
  const onError = (url: string) => loadErrors.push(url.split('/').pop() ?? url);
  const [wardData, featuresData, documentsData, adminUnitsData] = await Promise.all([
    safeFetchJson<FeatureCollection<Geometry, { [key: string]: unknown }>>(
      '/data/ward_boundary.geojson',
      EMPTY_FEATURE_COLLECTION,
      onError
    ),
    safeFetchJson<PlanningFeatureCollection>(
      '/data/features.geojson',
      EMPTY_FEATURE_COLLECTION as unknown as PlanningFeatureCollection,
      onError
    ),
    safeFetchJson<DocumentRecord[]>('/data/documents.json', [], onError),
    safeFetchJson<AdminUnit[]>('/data/admin_units.json', []),
  ]);
  if (!Array.isArray(featuresData?.features) && !loadErrors.includes('features.geojson')) {
    loadErrors.push('features.geojson');
  }
  if (!Array.isArray(documentsData) && !loadErrors.includes('documents.json')) {
    loadErrors.push('documents.json');
  }

  // Determine if ward has valid polygon features
  let wardLoadError = false;
  if (
    !wardData ||
    !wardData.features ||
    wardData.features.length === 0 ||
    !wardData.features.some(
      (f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
    )
  ) {
    wardLoadError = true;
    if (!loadErrors.includes('ward_boundary.geojson')) loadErrors.push('ward_boundary.geojson');
  }

  return {
    ward: wardData || EMPTY_FEATURE_COLLECTION,
    features: Array.isArray(featuresData?.features)
      ? featuresData
      : (EMPTY_FEATURE_COLLECTION as unknown as PlanningFeatureCollection),
    documents: Array.isArray(documentsData) ? documentsData : [],
    adminUnits: adminUnitsData || [],
    wardLoadError,
    loadErrors,
  };
}

/**
 * Filters planning features based on review_status and preview mode.
 */
export function filterVisibleFeatures(
  features: PlanningFeature[],
  preview: boolean
): PlanningFeature[] {
  return features.filter((f) => isPublishable(f.properties, preview));
}

/**
 * Creates centroid points from polygon features for clean map labels.
 * Only features with a non-empty mapLabel() get a label (unresolved codes get none).
 */
export function createCentroidLabels(
  features: PlanningFeature[]
): FeatureCollection<Point, { label: string }> {
  const labelFeatures: Feature<Point, { label: string }>[] = [];

  for (const f of features) {
    const label = mapLabel(f.properties);
    if (label) {
      try {
        const geom = f.geometry;
        if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
          const pt = turf.centroid(f as Feature<Polygon | MultiPolygon>);
          labelFeatures.push({
            type: 'Feature',
            geometry: pt.geometry,
            properties: { label },
          });
        }
      } catch {
        // Skip label on malformed geometry
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features: labelFeatures,
  };
}

/**
 * Computes area in hectares directly from polygon geometry.
 * Never reads from properties.
 */
export function computeAreaHa(geom: Geometry | Feature<Geometry>): number | null {
  try {
    const feature = 'type' in geom && geom.type === 'Feature' ? geom : turf.feature(geom as Geometry);
    const m2 = turf.area(feature);
    const ha = m2 / 10000;
    return Number(ha.toFixed(2));
  } catch {
    return null;
  }
}

/**
 * LocalStorage management for saved places (failsafe).
 */
const STORAGE_KEY = 'urbanv_saved_places_v1';
const TEXT_SIZE_KEY = 'urbanv_large_text_v1';

export function getSavedPlaces(): SavedPlace[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function savePlaceLocally(place: SavedPlace): boolean {
  try {
    const existing = getSavedPlaces();
    const updated = [place, ...existing.filter((p) => p.id !== place.id)].slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

export function removeSavedPlaceLocally(id: string): boolean {
  try {
    const existing = getSavedPlaces();
    const updated = existing.filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

export function getLargeTextPref(): boolean {
  try {
    return localStorage.getItem(TEXT_SIZE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setLargeTextPref(enabled: boolean): void {
  try {
    localStorage.setItem(TEXT_SIZE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage errors
  }
}
