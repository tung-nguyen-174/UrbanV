import type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon } from 'geojson';
import type { LandUseCode, ResultStatus, ReviewStatus } from './taxonomy';

export interface PlanningFeatureProperties {
  id: string;
  layer: 'landuse' | 'transport' | 'admin';
  category_code?: LandUseCode | string;
  admin_unit_id?: string;
  document_id?: string;
  source_page?: number;
  effective_date?: string;
  last_checked?: string;
  accuracy_m?: number;
  version_label?: string;
  transitional?: boolean;
  review_status?: ReviewStatus | string;
}

export type PlanningFeature = Feature<Geometry, PlanningFeatureProperties>;
export type PlanningFeatureCollection = FeatureCollection<Geometry, PlanningFeatureProperties>;

export type WardPolygon = Polygon | MultiPolygon;
export type WardFeature = Feature<WardPolygon, { [key: string]: unknown }>;
export type WardFeatureCollection = FeatureCollection<WardPolygon, { [key: string]: unknown }>;

export interface DocumentRecord {
  id: string;
  number: string;
  title: string;
  authority: string;
  signed_date: string;
  effective_date: string;
  official_url: string;
  scope: string;
  republish_permission: 'unknown' | 'granted' | 'denied' | string;
}

export interface AdminUnit {
  id: string;
  name: string;
  level: 'province' | 'commune' | string;
  parent_id?: string;
  valid_from: string | null;
  valid_to: string | null;
  predecessors: string[];
}

export interface LookupOptions {
  previewMode?: boolean;
  now?: Date;
}

export interface LookupResult {
  status: ResultStatus;
  scope: 'inside' | 'outside' | 'noward';
  matches: PlanningFeature[];
  nearestBoundaryM: number | null;
  reasons: string[];
  message: string;
  lng: number;
  lat: number;
  wardName: string;
}

export interface SavedPlace {
  id: string;
  label: string;
  lng: number;
  lat: number;
  savedAt: string;
  status: ResultStatus;
  categoryCode?: string;
  note?: string;
}
