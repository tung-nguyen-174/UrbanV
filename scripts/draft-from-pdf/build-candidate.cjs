// Build georeferenced candidate features from the 2030 sheet vector extraction.
// Georeference from the sheet's own VN-2000 grid labels (read by OCR):
//   easting label 574 km at the first vertical grid line, +2 km per line
//   northing label 2180 km at the lowest horizontal grid line, +2 km per line
// Projection: VN-2000 TM, central meridian 105, k0 0.9999, false easting 500000, GRS80.
// Usage: node build-candidate.cjs <vector.json> <ward.geojson> <out.geojson>
const fs = require('fs');
const { createRequire } = require('module');
const repo = require('path').resolve(__dirname, '../..');
const req = createRequire(repo + '/package.json');
const turf = req('@turf/turf');
const proj4 = req('proj4');

const [vecPath, wardPath, outPath] = process.argv.slice(2);
const vec = JSON.parse(fs.readFileSync(vecPath, 'utf8'));
const WARD_CLIP = wardPath !== 'none';
const ward = WARD_CLIP ? JSON.parse(fs.readFileSync(wardPath, 'utf8')).features[0] : null;
const TM = '+proj=tmerc +lat_0=0 +lon_0=105 +k=0.9999 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs';

// Grid: vertical lines (ascending x) and horizontal lines (ascending y)
const vx = vec.grid.vx, hy = vec.grid.hy;
const E0 = 574000, N0 = 2180000; // label values at the first vertical line and the lowest horizontal line
console.log('vertical lines', vx.length, 'first', vx[0], 'last', vx[vx.length - 1]);
console.log('horizontal lines', hy.length, 'first', hy[0], 'last', hy[hy.length - 1]);
const pxToE = (x) => E0 + ((x - vx[0]) / (vx[1] - vx[0])) * 2000;
const pyToN = (y) => N0 + ((y - hy[0]) / (hy[1] - hy[0])) * 2000;
// Sanity: the top horizontal line should read 2200 km
console.log('top line northing', Math.round(pyToN(hy[hy.length - 1])), 'expected 2200000');
console.log('last vertical easting', Math.round(pxToE(vx[vx.length - 1])));

const toLL = ([x, y]) => proj4(TM, 'WGS84', [pxToE(x), pyToN(y)]);

// Hole handling: a ring nested at odd depth inside other rings of the same path is a hole.
function ringToPolyRings(rings) {
  const pts = rings.map((r) => r.map(toLL));
  const area = (r) => Math.abs(turf.area(turf.polygon([[...r, r[0]]])));
  const info = pts.map((r) => ({ r, a: area(r) }));
  const contains = (outer, inner) => {
    const p = turf.point(inner[0]);
    return turf.booleanPointInPolygon(p, turf.polygon([[...outer, outer[0]]]));
  };
  const polys = [];
  const depth = info.map((it, i) => info.filter((o, j) => j !== i && o.a > it.a && contains(o.r, it.r)).length);
  info.forEach((it, i) => {
    if (depth[i] % 2 === 0) polys.push({ outer: it.r, holes: [] });
  });
  info.forEach((it, i) => {
    if (depth[i] % 2 === 1) {
      // attach to the smallest outer ring that contains it
      let best = null;
      polys.forEach((p) => { if (contains(p.outer, it.r) && (!best || area(p.outer) < area(best.outer))) best = p; });
      if (best) best.holes.push(it.r);
    }
  });
  return polys;
}

const features = [];
let nRaw = 0, nClipped = 0, nDropped = 0;
for (const [group, paths] of Object.entries(vec.groups)) {
  for (const path of paths) {
    nRaw++;
    const rings = path.rings.filter((r) => r.length >= 3);
    if (!rings.length) { nDropped++; continue; }
    for (const { outer, holes } of ringToPolyRings(rings)) {
      let geom;
      try {
        geom = turf.polygon([[...outer, outer[0]], ...holes.map((h) => [...h, h[0]])]);
      } catch { nDropped++; continue; } // degenerate ring
      let parts;
      if (WARD_CLIP) {
        // Only keep the part inside the ward
        const bb = turf.bbox(geom), wb = turf.bbox(ward);
        if (bb[2] < wb[0] || bb[0] > wb[2] || bb[3] < wb[1] || bb[1] > wb[3]) { nDropped++; continue; }
        let clipped = null;
        try { clipped = turf.intersect(turf.featureCollection([geom, ward])); } catch { clipped = null; }
        if (!clipped) { nDropped++; continue; }
        parts = clipped.geometry.type === 'Polygon' ? [clipped.geometry] : clipped.geometry.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }));
      } else {
        parts = [geom.geometry];
      }
      for (const part of parts) {
        let g = part;
        try { g = turf.simplify({ type: 'Feature', properties: {}, geometry: part }, { tolerance: 0.00002, highQuality: true }).geometry; } catch { g = part; }
        const a = turf.area({ type: 'Feature', properties: {}, geometry: g });
        if (a < 1) { nDropped++; continue; } // under 1 m²: slivers
        nClipped++;
        features.push({
          type: 'Feature',
          geometry: g,
          properties: { legend_group: group, layer: 'landuse', area_m2: Math.round(a) },
        });
      }
    }
  }
}
// Assign ids in order per group
const counters = {};
for (const f of features) {
  const g = f.properties.legend_group;
  counters[g] = (counters[g] || 0) + 1;
  f.properties.id = `draft-${g.toLowerCase()}-${String(counters[g]).padStart(4, '0')}`;
}
const byGroup = {};
for (const f of features) byGroup[f.properties.legend_group] = (byGroup[f.properties.legend_group] || 0) + 1;
console.log('raw paths', nRaw, 'kept polygons', nClipped, 'dropped', nDropped);
console.log('per group', JSON.stringify(byGroup));
fs.writeFileSync(outPath, JSON.stringify({ type: 'FeatureCollection', features }));
console.log('wrote', outPath, fs.statSync(outPath).size, 'bytes');
