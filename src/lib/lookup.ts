import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Geometry, Point, Polygon, MultiPolygon } from 'geojson';
import {
  boundaryThresholdM,
  COPY,
  isPublishable,
  isStale,
  type ResultStatus,
} from '../taxonomy';
import type {
  LookupOptions,
  LookupResult,
  PlanningFeature,
  PlanningFeatureCollection,
} from '../types';

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
 * Pure planning lookup function.
 * Evaluates whether a coordinate (lng, lat) falls within the ward boundary and
 * planning zones according to Thông tư 08/2024/TT-BTNMT and UrbanV rules.
 *
 * @param lng Longitude (EPSG:4326)
 * @param lat Latitude (EPSG:4326)
 * @param ward Ward boundary Feature, FeatureCollection, or null
 * @param features FeatureCollection containing land-use & transport zones
 * @param opts Lookup options (previewMode, custom now date for testability)
 * @returns LookupResult with status, matches, boundary distance, and reasons
 */
export function lookup(
  lng: number,
  lat: number,
  ward: FeatureCollection<Geometry> | Feature<Geometry> | Geometry | null | undefined,
  features: PlanningFeatureCollection | PlanningFeature[] | null | undefined,
  opts: LookupOptions = {}
): LookupResult {
  const pt = turf.point([lng, lat]);
  const now = opts.now ?? new Date();
  const previewMode = Boolean(opts.previewMode);
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

  // 2. Filter publishable features
  const allFeatures: PlanningFeature[] = Array.isArray(features)
    ? features
    : features?.features ?? [];

  const candidateFeatures = allFeatures.filter((f) => {
    if (!f.properties) return false;
    if (previewMode) {
      // In preview mode: approved, reviewed, draft are allowed
      const s = f.properties.review_status;
      return s === 'approved' || s === 'reviewed' || s === 'draft';
    }
    return isPublishable(f.properties);
  });

  // 3. Find matching features that contain the point
  const matches: PlanningFeature[] = [];
  for (const feat of candidateFeatures) {
    if (isPointInside(pt, feat)) {
      matches.push(feat);
    }
  }

  // 4. If no matches inside the ward
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

  // 5. Compute distance in metres to each match's boundary outline
  let nearestBoundaryM: number | null = null;
  const boundaryDistances: (number | null)[] = [];

  for (const match of matches) {
    const dist = distanceToBoundaryM(pt, match);
    boundaryDistances.push(dist);
    if (dist !== null) {
      if (nearestBoundaryM === null || dist < nearestBoundaryM) {
        nearestBoundaryM = dist;
      }
    }
  }

  // 6. Determine status priority and reasons
  const reasons: string[] = [];
  let isUncertain = false;
  let isCaution = false;

  if (nearestBoundaryM !== null) {
    reasons.push(`Cách ranh giới quy hoạch gần nhất ${nearestBoundaryM} m`);
  }

  // Check each match for uncertainty criteria
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const props = match.properties;
    const dist = boundaryDistances[i];
    const threshold = boundaryThresholdM(props.accuracy_m);

    // Rule: near boundary
    if (dist !== null && dist < threshold) {
      isUncertain = true;
      reasons.push(
        `Vị trí cách ranh giới ${dist} m, nhỏ hơn ngưỡng không chắc chắn (${threshold} m)`
      );
    }

    // Rule: stale data (>12 months)
    if (isStale(props.last_checked, now)) {
      isUncertain = true;
      const lastStr = props.last_checked ? props.last_checked : 'chưa xác định';
      reasons.push(`Dữ liệu cập nhật lần cuối ${lastStr} (quá 12 tháng)`);
    } else if (props.last_checked) {
      reasons.push(`Dữ liệu cập nhật gần nhất: ${props.last_checked}`);
    }

    // Rule: unapproved feature in preview mode
    if (props.review_status !== 'approved') {
      isUncertain = true;
      const st =
        props.review_status === 'draft' ? 'Bản nháp' : 'Đang duyệt';
      reasons.push(`Chỉ là dữ liệu ${st}, chưa được phê duyệt chính thức`);
    }

    // Rule: transitional plan
    if (props.transitional) {
      isCaution = true;
      reasons.push(COPY.transitionalVi);
    }
  }

  // Rule: transport corridor overlapping landuse
  const hasTransport = matches.some((m) => m.properties.layer === 'transport');
  const hasLanduse = matches.some((m) => m.properties.layer === 'landuse');
  if (hasTransport && hasLanduse) {
    isCaution = true;
    reasons.push('Vị trí đồng thời giao cắt giữa đất quy hoạch và tuyến giao thông');
  }

  let status: ResultStatus = 'fit';
  if (isUncertain) {
    status = 'uncertain';
  } else if (isCaution) {
    status = 'caution';
  } else {
    status = 'fit';
  }

  // Provide plain Vietnamese summary sentence
  let message = '';
  if (status === 'fit') {
    message = 'Vị trí này nằm trong vùng quy hoạch theo dữ liệu đã được duyệt.';
  } else if (status === 'caution') {
    message =
      'Có yếu tố quy hoạch chuyển tiếp hoặc hành lang giao thông cần lưu ý.';
  } else if (status === 'uncertain') {
    message =
      'Vị trí gần ranh giới hoặc dữ liệu cần xác minh thêm với cơ quan có thẩm quyền.';
  } else {
    message = COPY.noPlanInWardVi;
  }

  return {
    status,
    scope: 'inside',
    matches,
    nearestBoundaryM,
    reasons,
    message,
    lng,
    lat,
    wardName,
  };
}

/*
 ==============================================================================
 UNIT-TEST EXAMPLES IN PLAIN COMMENTS (6 SCENARIOS)
 ==============================================================================

 Scenario 1: Point outside ward boundary
 ---------------------------------------
 const wardPolygon = {
   type: "Feature",
   geometry: { type: "Polygon", coordinates: [[[105.7, 19.8], [105.8, 19.8], [105.8, 19.9], [105.7, 19.9], [105.7, 19.8]]] },
   properties: {}
 };
 const res1 = lookup(106.0, 20.0, wardPolygon, []);
 // res1.status === "nodata"
 // res1.scope === "outside"
 // res1.message === COPY.outOfPilotVi ("Ngoài phạm vi thí điểm...")

 Scenario 2: Point inside ward boundary, but no planning polygon
 ---------------------------------------------------------------
 const res2 = lookup(105.75, 19.85, wardPolygon, []);
 // res2.status === "nodata"
 // res2.scope === "inside"
 // res2.message === COPY.noPlanInWardVi ("Vị trí nằm trong Phường Hạc Thành nhưng chưa có dữ liệu...")

 Scenario 3: Point inside approved ODT polygon, well clear of boundary (60m > 30m), fresh data
 --------------------------------------------------------------------------------------------
 const odtFeature = {
   type: "Feature",
   geometry: { type: "Polygon", coordinates: [[[105.74, 19.84], [105.76, 19.84], [105.76, 19.86], [105.74, 19.86], [105.74, 19.84]]] },
   properties: { id: "odt-1", layer: "landuse", category_code: "ODT", review_status: "approved", last_checked: "2026-08-01", accuracy_m: 5 }
 };
 const res3 = lookup(105.75, 19.85, wardPolygon, [odtFeature]);
 // res3.status === "fit"
 // res3.matches.length === 1
 // res3.nearestBoundaryM > 30

 Scenario 4: Point inside approved ODT polygon, but within 15m of boundary (threshold 30m)
 -----------------------------------------------------------------------------------------
 const res4 = lookup(105.7401, 19.85, wardPolygon, [odtFeature]);
 // res4.nearestBoundaryM === 11 (which is < 30m)
 // res4.status === "uncertain"
 // res4.reasons includes boundary distance note

 Scenario 5: Point inside approved ODT polygon, far from boundary, but stale (>12 months)
 ----------------------------------------------------------------------------------------
 const staleFeature = {
   ...odtFeature,
   properties: { ...odtFeature.properties, last_checked: "2024-01-01" }
 };
 const res5 = lookup(105.75, 19.85, wardPolygon, [staleFeature], { now: new Date("2026-10-08") });
 // res5.status === "uncertain"
 // res5.reasons includes "quá 12 tháng"

 Scenario 6: Point inside approved ODT polygon overlapping a DGT transport corridor
 -----------------------------------------------------------------------------------
 const dgtFeature = {
   type: "Feature",
   geometry: { type: "Polygon", coordinates: [[[105.74, 19.84], [105.76, 19.84], [105.76, 19.86], [105.74, 19.86], [105.74, 19.84]]] },
   properties: { id: "dgt-1", layer: "transport", category_code: "DGT", review_status: "approved", last_checked: "2026-08-01" }
 };
 const res6 = lookup(105.75, 19.85, wardPolygon, [odtFeature, dgtFeature]);
 // res6.status === "caution"
 // res6.matches.length === 2
 // res6.reasons includes cross-zone transport overlap warning
 ==============================================================================
*/
