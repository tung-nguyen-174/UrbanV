import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Geometry, Point, Polygon, MultiPolygon } from 'geojson';
import { isPublishable } from '../taxonomy';
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
export async function safeFetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`[UrbanV Data] Fetch ${url} returned ${res.status}`);
      return fallback;
    }
    const data = await res.json();
    return data as T;
  } catch (err) {
    console.warn(`[UrbanV Data] Failed to fetch ${url}:`, err);
    return fallback;
  }
}

/**
 * Loads all initial datasets.
 */
export async function loadAppDatasets(): Promise<{
  ward: FeatureCollection<Geometry, { [key: string]: unknown }>;
  features: PlanningFeatureCollection;
  documents: DocumentRecord[];
  adminUnits: AdminUnit[];
  wardLoadError: boolean;
}> {
  const [wardData, featuresData, documentsData, adminUnitsData] = await Promise.all([
    safeFetchJson<FeatureCollection<Geometry, { [key: string]: unknown }>>(
      '/data/ward_boundary.geojson',
      EMPTY_FEATURE_COLLECTION
    ),
    safeFetchJson<PlanningFeatureCollection>(
      '/data/features.geojson',
      EMPTY_FEATURE_COLLECTION as unknown as PlanningFeatureCollection
    ),
    safeFetchJson<DocumentRecord[]>('/data/documents.json', []),
    safeFetchJson<AdminUnit[]>('/data/admin_units.json', []),
  ]);

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
  }

  return {
    ward: wardData || EMPTY_FEATURE_COLLECTION,
    features: featuresData || (EMPTY_FEATURE_COLLECTION as unknown as PlanningFeatureCollection),
    documents: documentsData || [],
    adminUnits: adminUnitsData || [],
    wardLoadError,
  };
}

/**
 * Filters planning features based on review_status and preview mode.
 */
export function filterVisibleFeatures(
  features: PlanningFeature[],
  preview: boolean
): PlanningFeature[] {
  return features.filter((f) => {
    if (!f.properties) return false;
    if (preview) {
      const s = f.properties.review_status;
      return s === 'approved' || s === 'reviewed' || s === 'draft';
    }
    return isPublishable(f.properties);
  });
}

/**
 * Creates centroid points from polygon land-use features for clean map labels.
 * Only landuse features with a valid category_code get a label.
 */
export function createCentroidLabels(
  features: PlanningFeature[]
): FeatureCollection<Point, { category_code: string; label: string }> {
  const labelFeatures: Feature<Point, { category_code: string; label: string }>[] = [];

  for (const f of features) {
    if (f.properties?.layer === 'landuse' && f.properties.category_code) {
      try {
        const geom = f.geometry;
        if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
          // Use turf.pointOnFeature to ensure centroid is inside concave polygons
          const pt = turf.pointOnFeature(f as Feature<Polygon | MultiPolygon>);
          labelFeatures.push({
            type: 'Feature',
            geometry: pt.geometry,
            properties: {
              category_code: f.properties.category_code,
              label: f.properties.category_code,
            },
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
