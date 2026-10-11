// Stats for the candidate: bounds, area coverage of the ward, and overlap with the ward outline.
const fs = require('fs');
const { createRequire } = require('module');
const turf = createRequire(require('path').resolve(__dirname, '../../package.json'))('@turf/turf');
const cand = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ward = JSON.parse(fs.readFileSync(require('path').resolve(__dirname, '../../public/data/ward_boundary.geojson'), 'utf8')).features[0];
const wb = turf.bbox(ward);
const cb = turf.bbox(turf.featureCollection(cand.features));
console.log('ward bbox', wb.map((v) => v.toFixed(4)).join(', '));
console.log('candidate bbox', cb.map((v) => v.toFixed(4)).join(', '));
const sumArea = cand.features.reduce((s, f) => s + turf.area(f), 0);
console.log('ward area km2', (turf.area(ward) / 1e6).toFixed(2), 'candidate area sum km2', (sumArea / 1e6).toFixed(2));
// Sample grid of points inside the ward: share covered by any candidate polygon
const pts = [];
const [minX, minY, maxX, maxY] = wb;
const N = 60;
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  const p = turf.point([minX + ((i + 0.5) / N) * (maxX - minX), minY + ((j + 0.5) / N) * (maxY - minY)]);
  if (turf.booleanPointInPolygon(p, ward)) pts.push(p);
}
let covered = 0;
for (const p of pts) if (cand.features.some((f) => turf.booleanPointInPolygon(p, f))) covered++;
console.log('ward sample points', pts.length, 'covered by a candidate zone', covered, '=', ((100 * covered) / pts.length).toFixed(1) + '%');
