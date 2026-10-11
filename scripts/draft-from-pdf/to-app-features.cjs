// Convert the georeferenced candidate into the app's features.geojson schema (SPEC section 6).
// Usage: node to-app-features.cjs <candidate.geojson> <taxonomy.ts> <ward.geojson> <out.geojson>
const fs = require('fs');
const { createRequire } = require('module');
const turf = createRequire(require('path').resolve(__dirname, '../../package.json'))('@turf/turf');
const [candPath, taxPath, wardPath, outPath] = process.argv.slice(2);
const cand = JSON.parse(fs.readFileSync(candPath, 'utf8'));
const ward = JSON.parse(fs.readFileSync(wardPath, 'utf8')).features[0];
const tax = fs.readFileSync(taxPath, 'utf8');

// Codes per legend group, from the LAND_USE_LIST in taxonomy.ts
const codesByGroup = {};
for (const m of tax.matchAll(/\b[LM]\(\s*'([A-Z]+)',\s*'[^']*',\s*(?:'([A-Z_]+)'|null)/g)) {
  if (!m[2]) continue;
  (codesByGroup[m[2]] ||= []).push(m[1]);
}

const TODAY = '2026-10-11';
const features = cand.features.map((f) => {
  const g = f.properties.legend_group;
  const inWard = turf.booleanPointInPolygon(turf.pointOnFeature(f), ward);
  return {
    type: 'Feature',
    properties: {
      id: f.properties.id,
      layer: 'landuse',
      category_code: null,
      candidate_codes: codesByGroup[g] || [],
      legend_group: g,
      code_resolved: false,
      admin_unit_id: inWard ? 'phuong-hac-thanh' : null,
      document_id: 'qhsdd-2030-tpth',
      source_page: 1,
      effective_date: null,
      last_checked: TODAY,
      accuracy_m: null,
      version_label: 'QHSDĐ đến 2030 (bản đồ in 10/09/2021, chưa rõ số quyết định)',
      transitional: true,
      review_status: 'draft',
    },
    geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
  };
});
function round(c) {
  if (typeof c[0] === 'number') return [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6];
  return c.map(round);
}
fs.writeFileSync(outPath, JSON.stringify({ type: 'FeatureCollection', features }));

// Legend shares: area of each group inside the ward, as a share of the ward. Computed here once
// (about a minute) because doing it in the browser freezes the page.
const wardArea = turf.area(ward);
const inWard = {};
for (const f of features) {
  const g = f.properties.legend_group;
  const box = turf.bbox(f), wb = turf.bbox(ward);
  if (box[2] < wb[0] || box[0] > wb[2] || box[3] < wb[1] || box[1] > wb[3]) continue;
  try {
    const c = turf.intersect(turf.featureCollection([f, ward]));
    if (c) inWard[g] = (inWard[g] || 0) + turf.area(c);
  } catch { /* block that cannot be clipped is left out */ }
}
const shares = {};
for (const [g, a] of Object.entries(inWard)) shares[g] = Math.round((a / wardArea) * 10000) / 10000;
fs.writeFileSync(outPath.replace(/features\.geojson$/, 'legend_shares.json'), JSON.stringify({
  computed: TODAY,
  ward_area_m2: Math.round(wardArea),
  source: 'features.geojson, clipped to ward_boundary.geojson',
  shares,
}, null, 2));
console.log('legend shares', JSON.stringify(shares));
const byG = {};
for (const f of features) byG[f.properties.legend_group] = (byG[f.properties.legend_group] || 0) + 1;
console.log('features', features.length, JSON.stringify(byG));
console.log('codes sample', JSON.stringify(Object.fromEntries(Object.entries(codesByGroup).slice(0, 4))));
console.log('wrote', outPath, fs.statSync(outPath).size, 'bytes');
