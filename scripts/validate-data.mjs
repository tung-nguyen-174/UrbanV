#!/usr/bin/env node
/**
 * scripts/validate-data.mjs
 *
 * Checks public/data/features.geojson against SPEC.md and src/taxonomy.ts.
 * Runs before every build; any ERROR stops the build (exit code 1).
 * WARNINGS are printed but do not fail.
 *
 * Usage: npm run validate-data
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as turf from '@turf/turf';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public', 'data');
const rel = (p) => relative(ROOT, p).replaceAll('\\', '/');

const OUTSIDE_WARD_MAX_M = 50;
const SMALL_POLYGON_HA = 0.15;
const REVIEW_STATUSES = ['draft', 'reviewed', 'approved'];

const errors = [];
const warnings = [];
const error = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
/** Same warning for many draft/reviewed features: collected, printed once with the ids. */
const groupedWarnings = new Map();
const groupWarn = (key, id) => groupedWarnings.set(key, [...(groupedWarnings.get(key) ?? []), id]);

function fail(msg) {
  console.error(`\n✖ validate-data: ${msg}\n`);
  process.exit(1);
}

function readJson(path) {
  if (!existsSync(path)) fail(`missing file ${rel(path)}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(`${rel(path)} is not valid JSON (${e.message})`);
  }
}

// ---------------------------------------------------------------------------
// Taxonomy: read the code and group lists straight from src/taxonomy.ts so
// they can never drift from the app. Fails loudly if the file format changes.
// ---------------------------------------------------------------------------
const taxonomySrc = readFileSync(join(ROOT, 'src', 'taxonomy.ts'), 'utf8');

const listBody = taxonomySrc.match(/LAND_USE_LIST[^=]*=\s*\[([\s\S]*?)\n\];/)?.[1];
const LAND_USE_CODES = new Set(
  [...(listBody ?? '').matchAll(/\b[LM]\(\s*'([A-Z]+)'/g)].map((m) => m[1])
);
const groupsBody = taxonomySrc.match(/LEGEND_GROUPS[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1];
const LEGEND_GROUP_IDS = new Set(
  [...(groupsBody ?? '').matchAll(/^\s*([A-Z_]+):\s*G\(/gm)].map((m) => m[1])
);
if (LAND_USE_CODES.size === 0 || LEGEND_GROUP_IDS.size === 0) {
  fail('could not read LAND_USE_LIST / LEGEND_GROUPS from src/taxonomy.ts; update the parser in this script');
}

/** Same rule as isDocumentVerified() in src/taxonomy.ts. */
const isDocumentVerified = (doc) => !!doc && !!doc.number && !!doc.effective_date;

// ---------------------------------------------------------------------------
// Load data
// ---------------------------------------------------------------------------
const featuresPath = join(DATA, 'features.geojson');
const wardPath = join(DATA, 'ward_boundary.geojson');
const documentsPath = join(DATA, 'documents.json');
const reviewLogPath = join(DATA, 'review_log.json');

if (!existsSync(reviewLogPath)) {
  writeFileSync(reviewLogPath, '[]\n');
  console.log(`ℹ created ${rel(reviewLogPath)} (empty array)`);
}

const features = readJson(featuresPath).features;
if (!Array.isArray(features)) fail(`${rel(featuresPath)} has no "features" array`);

const wardFc = readJson(wardPath);
const wardPolys = (wardFc.features ?? []).filter((f) =>
  ['Polygon', 'MultiPolygon'].includes(f.geometry?.type)
);
if (wardPolys.length === 0) fail(`${rel(wardPath)} has no Polygon/MultiPolygon feature`);
// Boundary lines of each ward feature, tagged with where they came from (for messages)
const wardLines = wardPolys.flatMap((f) => {
  const l = turf.polygonToLine(f);
  const label = `${rel(wardPath)} feature #${wardFc.features.indexOf(f)}${f.properties?.id ? ` ("${f.properties.id}")` : ''}`;
  // polygonToLine gives a MultiLineString when the ward has holes: split into single rings
  const parts = l.type === 'FeatureCollection' ? l.features : [l];
  return parts.flatMap((part) => {
    const rings = part.geometry.type === 'LineString' ? [part.geometry.coordinates] : part.geometry.coordinates;
    return rings.map((coords) => ({ line: turf.lineString(coords), label }));
  });
});

const documents = readJson(documentsPath);
const docsById = new Map(documents.map((d) => [d.id, d]));

const reviewLog = readJson(reviewLogPath);
if (!Array.isArray(reviewLog)) fail(`${rel(reviewLogPath)} must be a JSON array`);
const reviewedIds = new Set(reviewLog.map((r) => r.feature_id));

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
function inWard(pt) {
  return wardPolys.some((w) => turf.booleanPointInPolygon(pt, w));
}

/**
 * Worst vertex of the polygon's OUTER ring(s) that is not inside the ward, with its
 * distance in metres to the ward boundary. Holes are ignored. null if all inside.
 */
function worstOutsideWard(geom) {
  const polygons = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let worst = null;
  polygons.forEach((rings, polygonIndex) => {
    const outer = rings[0] ?? [];
    for (const coord of outer) {
      const pt = turf.point(coord);
      if (inWard(pt)) continue;
      // Distance to the nearest ward boundary line
      let nearest = null;
      for (const { line, label } of wardLines) {
        const m = turf.pointToLineDistance(pt, line, { units: 'meters' });
        if (!nearest || m < nearest.m) nearest = { m, label };
      }
      if (nearest && (!worst || nearest.m > worst.m)) {
        worst = { polygonIndex, coord, ...nearest };
      }
    }
  });
  return worst;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------
const seenIds = new Set();
const counts = { draft: 0, reviewed: 0, approved: 0 };

features.forEach((f, i) => {
  const p = f.properties ?? {};
  const where = `feature #${i}${p.id ? ` (id "${p.id}")` : ''}`;

  if (!p.id) error(where, 'missing "id"');
  else if (seenIds.has(p.id)) error(where, `duplicate id "${p.id}"`);
  else seenIds.add(p.id);

  // Taxonomy
  if (!LEGEND_GROUP_IDS.has(p.legend_group)) {
    error(where, `legend_group ${JSON.stringify(p.legend_group)} is not one of: ${[...LEGEND_GROUP_IDS].join(', ')}`);
  }
  if (p.category_code !== null && !LAND_USE_CODES.has(p.category_code)) {
    error(where, `category_code ${JSON.stringify(p.category_code)} must be null or a taxonomy code`);
  }
  if (!REVIEW_STATUSES.includes(p.review_status)) {
    error(where, `review_status ${JSON.stringify(p.review_status)} must be draft, reviewed or approved`);
  } else {
    counts[p.review_status]++;
  }

  // Review-related rules (SPEC rules 6 and 12): ERROR for approved, WARNING for draft/reviewed.
  // Warnings for non-approved features are grouped per rule so the output stays readable.
  const isApproved = p.review_status === 'approved';
  const reviewRule = (msg, groupKey) => {
    if (isApproved) error(where, `approved feature: ${msg}`);
    else if (groupKey) groupWarn(groupKey, p.id ?? `#${i}`);
    else warn(where, `${p.review_status} feature: ${msg}`);
  };
  if (isApproved && (p.category_code === null || p.category_code === undefined)) {
    error(where, 'approved feature has a null category_code');
  }
  const doc = docsById.get(p.document_id);
  if (!doc) {
    reviewRule(`document_id ${JSON.stringify(p.document_id)} is not in documents.json`,
      `document_id ${JSON.stringify(p.document_id)} is not in documents.json`);
  } else if (!isDocumentVerified(doc)) {
    reviewRule(`document "${doc.id}" has no number and/or effective_date in documents.json`,
      `document "${doc.id}" has no number and/or effective_date in documents.json`);
  }
  if (!reviewedIds.has(p.id)) {
    reviewRule('no entry in review_log.json', 'no entry in review_log.json');
  }

  // Geometry
  const type = f.geometry?.type;
  if (type !== 'Polygon' && type !== 'MultiPolygon') {
    error(where, `geometry must be Polygon or MultiPolygon (got ${type ?? 'none'})`);
    return;
  }
  const worst = worstOutsideWard(f.geometry);
  if (worst && worst.m > OUTSIDE_WARD_MAX_M) {
    const ring = f.geometry.type === 'MultiPolygon' ? `polygon ${worst.polygonIndex} outer ring` : 'outer ring 0';
    reviewRule(
      `vertex lies ${worst.m.toFixed(1)} m outside the ward (limit ${OUTSIDE_WARD_MAX_M} m): ` +
        `${ring}, lon ${worst.coord[0]}, lat ${worst.coord[1]}; compared against ${worst.label}`,
      `vertex more than ${OUTSIDE_WARD_MAX_M} m outside the ward`
    );
  }
  // Geometry warnings are grouped too: a full-sheet draft can have thousands of small blocks
  const kinks = turf.kinks(f).features.length;
  if (kinks > 0) groupWarn(`self-intersecting ring`, p.id ?? `#${i}`);
  const ha = turf.area(f) / 10000;
  if (ha < SMALL_POLYGON_HA) groupWarn(`polygon under ${SMALL_POLYGON_HA} ha`, p.id ?? `#${i}`);
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log(
  `validate-data: ${features.length} features in ${rel(featuresPath)} ` +
    `(approved ${counts.approved}, reviewed ${counts.reviewed}, draft ${counts.draft}), ` +
    `${documents.length} documents, ${reviewLog.length} review log entries`
);

for (const [msg, ids] of groupedWarnings) {
  const shown = ids.slice(0, 5).join(', ') + (ids.length > 5 ? `, +${ids.length - 5} more` : '');
  const blocks = /^(document|no entry)/.test(msg) ? ' (blocks approval)' : '';
  warnings.push(`${ids.length} feature(s): ${msg}${blocks} [${shown}]`);
}

if (warnings.length) {
  console.warn(`\n⚠ ${warnings.length} warning(s):`);
  for (const w of warnings) console.warn(`  - ${w}`);
}

if (errors.length) {
  console.error(`\n✖ ${errors.length} error(s), build stopped:`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error('');
  process.exit(1);
}

console.log(`\n✔ data valid (${warnings.length} warning(s), 0 errors)`);
