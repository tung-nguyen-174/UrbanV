import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Geometry, Point, Polygon, MultiPolygon } from 'geojson';
import {
  boundaryThresholdM,
  COPY,
  isPublishable,
  isStale,
  maxStatusFor,
  STATUS,
  THRESHOLDS,
  type ResultStatus,
} from '../taxonomy';
import type {
  DocumentRecord,
  LookupOptions,
  LookupResult,
  PlanningFeature,
  PlanningFeatureCollection,
} from '../types';

export interface LookupWithDocumentsOptions extends LookupOptions {
  /**
   * Entries of documents.json. A match whose document is missing here counts as
   * unverified, so it can never produce 'fit' (SPEC rule 12).
   */
  documents?: DocumentRecord[];
}

/**
 * Checks whether a point is contained within a polygon or multipolygon.
 */
function isPointInside(
  pt: Feature<Point>,
  geom: Feature<Geometry> | Geometry
): boolean {
  try {
    const g = 'geometry' in geom ? geom.geometry : geom;
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      return turf.booleanPointInPolygon(pt, g as Polygon | MultiPolygon);
    }
  } catch {
    // If geometry calculation fails, safely return false
  }
  return false;
}

/**
 * Calculates the shortest distance in meters from a point to a feature's boundary lines.
 */
function distanceToBoundaryM(
  pt: Feature<Point>,
  feature: Feature<Geometry>
): number | null {
  try {
    const g = feature.geometry;
    if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') {
      return null;
    }

    const lines = turf.polygonToLine(feature as Feature<Polygon | MultiPolygon>);
    if (!lines) return null;

    if (lines.type === 'FeatureCollection') {
      let minDistance = Infinity;
      for (const line of lines.features) {
        const d = turf.pointToLineDistance(pt, line as any, { units: 'meters' });
        if (d < minDistance) {
          minDistance = d;
        }
      }
      return Number.isFinite(minDistance) ? Math.round(minDistance) : null;
    } else if (lines.type === 'Feature') {
      const d = turf.pointToLineDistance(pt, lines as any, { units: 'meters' });
      return Number.isFinite(d) ? Math.round(d) : null;
    }
  } catch {
    // Spatial error fallback
  }
  return null;
}

/**
 * Checks if a point is inside the ward boundary.
 * Supports Ward Feature, FeatureCollection, Polygon, or MultiPolygon.
 */
function isPointInWard(
  pt: Feature<Point>,
  ward: FeatureCollection<Geometry> | Feature<Geometry> | Geometry | null | undefined
): boolean {
  if (!ward) return false;

  if ('type' in ward && ward.type === 'FeatureCollection') {
    const fc = ward as FeatureCollection<Geometry>;
    if (!fc.features || fc.features.length === 0) return false;
    for (const f of fc.features) {
      if (isPointInside(pt, f)) return true;
    }
    return false;
  }

  return isPointInside(pt, ward as Feature<Geometry>);
}

/**
 * Pure planning lookup function (SPEC sections 2 and 4).
 *
 * Order:
 *  1. Outside the ward polygon             -> nodata, scope 'outside'
 *  2. Publishable features containing the point (all of them)
 *  3. No match                             -> nodata
 *  4. maxStatusFor() per match, with its document from documents.json
 *  5. uncertain (near boundary | stale | any match capped at 'uncertain')
 *     > caution (transport + landuse overlap) > fit.
 *     `transitional` adds a note only.
 *
 * @param lng Longitude (EPSG:4326)
 * @param lat Latitude (EPSG:4326)
 * @param ward Ward boundary Feature, FeatureCollection, or null
 * @param features Planning features (filtered again here with isPublishable)
 * @param opts previewMode, documents, custom `now` for tests
 */
export function lookup(
  lng: number,
  lat: number,
  ward: FeatureCollection<Geometry> | Feature<Geometry> | Geometry | null | undefined,
  features: PlanningFeatureCollection | PlanningFeature[] | null | undefined,
  opts: LookupWithDocumentsOptions = {}
): LookupResult {
  const pt = turf.point([lng, lat]);
  const now = opts.now ?? new Date();
  const previewMode = Boolean(opts.previewMode);
  const documents = opts.documents ?? [];
  const wardName = 'Phường Hạc Thành, Tỉnh Thanh Hóa';

  // 1. Ward containment check
  // If ward boundary is provided and has polygon data, point MUST be inside
  const hasWardPolygons = Boolean(
    ward &&
      (('features' in ward &&
        (ward as FeatureCollection).features.some(
          (f) => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
        )) ||
        ('geometry' in ward &&
          ((ward as Feature).geometry.type === 'Polygon' ||
            (ward as Feature).geometry.type === 'MultiPolygon')) ||
        ('type' in ward &&
          (ward.type === 'Polygon' || ward.type === 'MultiPolygon')))
  );

  if (hasWardPolygons && !isPointInWard(pt, ward)) {
    return {
      status: 'nodata',
      scope: 'outside',
      matches: [],
      nearestBoundaryM: null,
      reasons: [COPY.outOfPilotVi],
      message: COPY.outOfPilotVi,
      lng,
      lat,
      wardName,
    };
  }

  // 2. All publishable features that contain the point
  const allFeatures: PlanningFeature[] = Array.isArray(features)
    ? features
    : features?.features ?? [];
  const matches = allFeatures.filter(
    (f) => isPublishable(f.properties, previewMode) && isPointInside(pt, f)
  );

  // 3. No match inside the ward
  if (matches.length === 0) {
    return {
      status: 'nodata',
      scope: hasWardPolygons ? 'inside' : 'noward',
      matches: [],
      nearestBoundaryM: null,
      reasons: [COPY.noPlanInWardVi],
      message: COPY.noPlanInWardVi,
      lng,
      lat,
      wardName,
    };
  }

  // 4-5. Evaluate every match. A Set keeps each reason line once.
  const reasons = new Set<string>();
  let isUncertain = false;
  let nearestBoundaryM: number | null = null;

  for (const match of matches) {
    const props = match.properties;
    const doc = documents.find((d) => d.id === props.document_id) ?? null;

    const cap = maxStatusFor(props, doc);
    if (cap.max === 'uncertain') isUncertain = true;
    cap.reasons.forEach((r) => reasons.add(r));

    const dist = distanceToBoundaryM(pt, match);
    if (dist !== null) {
      if (nearestBoundaryM === null || dist < nearestBoundaryM) nearestBoundaryM = dist;
      const threshold = boundaryThresholdM(props.accuracy_m);
      if (dist < threshold) {
        isUncertain = true;
        reasons.add(`Gần ranh giới (${dist} m, ngưỡng ${threshold} m)`);
      }
    }

    if (isStale(props.last_checked, now)) {
      isUncertain = true;
      reasons.add(
        props.last_checked
          ? `Dữ liệu cập nhật lần cuối ${props.last_checked}, quá ${THRESHOLDS.STALE_MONTHS} tháng`
          : 'Chưa rõ ngày cập nhật dữ liệu'
      );
    }

    // transitional adds a note; it does not lower the status
    if (props.transitional) reasons.add(COPY.transitionalVi);
  }

  const hasTransport = matches.some((m) => m.properties.layer === 'transport');
  const hasLanduse = matches.some((m) => m.properties.layer === 'landuse');
  const isCaution = hasTransport && hasLanduse;
  if (isCaution) reasons.add('Có tuyến giao thông chồng lên vị trí này');

  const status: ResultStatus = isUncertain ? 'uncertain' : isCaution ? 'caution' : 'fit';

  // 6. Distance to the nearest boundary always comes first
  const reasonLines = [...reasons];
  if (nearestBoundaryM !== null) {
    reasonLines.unshift(`Cách ranh giới gần nhất ${nearestBoundaryM} m`);
  }

  return {
    status,
    scope: 'inside',
    matches,
    nearestBoundaryM,
    reasons: reasonLines,
    message: STATUS[status].sentenceVi,
    lng,
    lat,
    wardName,
  };
}

/*
 ==============================================================================
 UNIT-TEST EXAMPLES (6 SCENARIOS). Vitest is not in this project, so these are
 written as comments. Shared fixtures:

 const ward = { type: "Feature", properties: {}, geometry: { type: "Polygon",
   coordinates: [[[105.70, 19.80], [105.80, 19.80], [105.80, 19.90], [105.70, 19.90], [105.70, 19.80]]] } };
 const square = { type: "Polygon",
   coordinates: [[[105.74, 19.84], [105.76, 19.84], [105.76, 19.86], [105.74, 19.86], [105.74, 19.84]]] };
 const docs = [
   { id: "doc-ok", number: "123/QĐ-UBND", effective_date: "2024-01-01", authority: "UBND tỉnh", ... },
 ];
 const now = new Date("2026-10-11");
 const props = { layer: "landuse", document_id: "doc-ok", last_checked: "2026-09-01", accuracy_m: 5 };
 const odt = (review_status) => ({ type: "Feature", geometry: square,
   properties: { ...props, id: "odt", category_code: "ODT", legend_group: "ODT", review_status } });
 ==============================================================================

 1. Outside ward
    lookup(106.0, 20.0, ward, [odt("approved")], { documents: docs, now })
    -> status "nodata", scope "outside", message === COPY.outOfPilotVi

 2. Inside ward, no match
    lookup(105.72, 19.82, ward, [odt("approved")], { documents: docs, now })
    -> status "nodata", scope "inside", message === COPY.noPlanInWardVi

 3. Draft ODT
    lookup(105.75, 19.85, ward, [odt("draft")], { documents: docs, now })
    -> "nodata" (drafts are hidden outside preview mode)
    lookup(105.75, 19.85, ward, [odt("draft")], { documents: docs, now, previewMode: true })
    -> "uncertain", reasons include COPY.notApprovedVi

 4. Approved ODT, verified document, centre of the square, fresh data
    lookup(105.75, 19.85, ward, [odt("approved")], { documents: docs, now })
    -> "fit", reasons[0] starts with "Cách ranh giới gần nhất"

 5. Salmon colour group, unresolved code
    salmon = { ...odt("approved"), properties: { ...props, id: "s1", category_code: null,
      legend_group: "SALMON", candidate_codes: ["TMD", "DHT", "DKV"], review_status: "approved" } }
    lookup(105.75, 19.85, ward, [salmon], { documents: docs, now })
    -> "uncertain", reasons include COPY.unresolvedReasonVi;
       featureTitleVi(salmon.properties) === "Đất phi nông nghiệp khác, chưa phân loại chi tiết"

 6. Approved verified ODT, about 10 m inside the west edge (threshold 30 m)
    lookup(105.7401, 19.85, ward, [odt("approved")], { documents: docs, now })
    -> "uncertain", nearestBoundaryM < 30, reasons include "Gần ranh giới (…)"
 ==============================================================================
*/
