// Extract legend-coloured land-use polygons (page coordinates, PDF points) from the 2030 sheet.
// Output: JSON { page, grid, groups: { GROUP: [ [ [x,y],...rings ], ... ] } }
// Usage: node extract-vector.cjs <pdf> <outJson>
const fs = require('fs'), zlib = require('zlib');
const [file, outJson] = process.argv.slice(2);
const buf = fs.readFileSync(file);
const latin = buf.toString('latin1');

// Legend colours (taxonomy.ts LEGEND_GROUPS colours, exact printed values)
const LEGEND = {
  ODT: 'FFA0FF', SALMON: 'FFAAA0', LUC_LUA: 'FFFF64', HNK: 'FFF0B4', CLN: 'FFD7AA',
  AQUA_NTS_MNC: 'AAFFFF', RPH: 'BEFF1E', RDD: '6EFF64', RSX: 'B4FFB4', CQP_CAN: 'FF505A',
  SKS_DRA: 'CDAACD', NTD: 'D2D2D2',
};
const COLOUR_TO_GROUP = Object.fromEntries(Object.entries(LEGEND).map(([g, hex]) => [hex, g]));

const mb = latin.match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/);
const page = mb ? mb.slice(1).map(Number) : [0, 0, 2384, 3370];

// Largest content stream = the sheet drawing
let content = null;
const re = /stream\r?\n/g;
let m;
while ((m = re.exec(latin))) {
  if (latin.slice(m.index - 3, m.index) === 'end') continue;
  const start = m.index + m[0].length;
  const end = latin.indexOf('endstream', start);
  if (end < 0) break;
  try {
    const d = zlib.inflateSync(buf.subarray(start, end));
    if (d.length > 1e6) { content = d.toString('latin1'); break; }
  } catch {}
}
if (!content) throw new Error('no drawing stream found');

const hex = (r, g, b) => [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const mul = (M, N) => { const [a, b, c, d, e, f] = M, [A, B, C, D, E, F] = N; return [a * A + b * C, a * B + b * D, c * A + d * C, c * B + d * D, e * A + f * C + E, e * B + f * D + F]; };
const apply = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];

const fills = {};      // group -> array of paths (each: array of rings in page coords)
const gridSegs = [];   // cyan strokes as [x1,y1,x2,y2] in page coords
let ctm = [1, 0, 0, 1, 0, 0];
const stack = [];
let fillHex = '000000', strokeHex = '000000';
let subs = [];  // subpaths (page coords)
let cur = null;
let last = [0, 0]; // last point in user space
const nums = [];
let fillCount = 0, unmatchedFills = 0;

const pushUser = (x, y) => {
  if (!cur) { cur = []; subs.push(cur); }
  cur.push(apply(ctm, x, y));
  last = [x, y];
};
const finish = (rule, doFill, doStroke) => {
  if (doFill && subs.length) {
    const group = COLOUR_TO_GROUP[fillHex];
    fillCount++;
    if (group) {
      (fills[group] ||= []).push({ rings: subs.filter((p) => p.length >= 3), rule });
    } else unmatchedFills++;
  }
  if (doStroke && strokeHex === '00FFFF') {
    for (const p of subs) for (let i = 1; i < p.length; i++) gridSegs.push([p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]]);
  }
  subs = []; cur = null;
};

for (const t of content.split(/\s+/)) {
  if (t === '') continue;
  if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) { nums.push(parseFloat(t)); continue; }
  const k = nums.length;
  switch (t) {
    case 'q': stack.push([ctm, fillHex, strokeHex]); break;
    case 'Q': { const s = stack.pop(); if (s) [ctm, fillHex, strokeHex] = s; break; }
    case 'cm': if (k >= 6) ctm = mul(nums.slice(-6), ctm); break;
    case 'rg': if (k >= 3) fillHex = hex(...nums.slice(-3)); break;
    case 'RG': if (k >= 3) strokeHex = hex(...nums.slice(-3)); break;
    case 'g': if (k >= 1) fillHex = hex(nums[k - 1], nums[k - 1], nums[k - 1]); break;
    case 'm': if (k >= 2) { cur = null; pushUser(nums[k - 2], nums[k - 1]); } break;
    case 'l': if (k >= 2) pushUser(nums[k - 2], nums[k - 1]); break;
    case 'c': if (k >= 6) {
      const [x0, y0] = last;
      const [x1, y1, x2, y2, x3, y3] = nums.slice(-6);
      for (let i = 1; i <= 6; i++) {
        const u = i / 6, v = 1 - u;
        pushUser(v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3,
                 v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3);
      }
    } break;
    case 're': if (k >= 4) { const [x, y, w, h] = nums.slice(-4); cur = null; pushUser(x, y); pushUser(x + w, y); pushUser(x + w, y + h); pushUser(x, y + h); cur = null; } break;
    case 'h': cur = null; break;
    case 'f': case 'F': finish('nonzero', true, false); break;
    case 'f*': finish('evenodd', true, false); break;
    case 'S': finish('nonzero', false, true); break;
    case 'B': finish('nonzero', true, true); break;
    case 'n': finish('nonzero', false, false); break;
    default: break;
  }
  nums.length = 0;
}

// Grid: cyan vertical and horizontal segments
const vert = [], horz = [];
for (const [x1, y1, x2, y2] of gridSegs) {
  if (Math.abs(x1 - x2) < 0.05 && Math.abs(y1 - y2) > 50) vert.push(x1);
  if (Math.abs(y1 - y2) < 0.05 && Math.abs(x1 - x2) > 50) horz.push(y1);
}
const uniq = (arr) => [...new Set(arr.map((v) => Math.round(v * 10) / 10))].sort((a, b) => a - b);
const vx = uniq(vert), hy = uniq(horz);
const spacing = (arr) => { const d = []; for (let i = 1; i < arr.length; i++) d.push(Math.round((arr[i] - arr[i - 1]) * 100) / 100); return d; };

const counts = Object.fromEntries(Object.entries(fills).map(([g, a]) => [g, a.length]));
console.log('page box', page.join(' '));
console.log('fill ops', fillCount, 'unmatched (non-legend) fills', unmatchedFills);
console.log('legend-coloured paths per group', JSON.stringify(counts));
console.log('cyan grid lines: vertical', vx.length, 'horizontal', hy.length);
console.log('vertical x positions (pt, first 12):', vx.slice(0, 12));
console.log('vertical spacing (pt):', spacing(vx).slice(0, 12));
console.log('horizontal y positions (pt, first 12):', hy.slice(0, 12));
console.log('horizontal spacing (pt):', spacing(hy).slice(0, 12));
fs.writeFileSync(outJson, JSON.stringify({ page, grid: { vx, hy }, groups: fills }));
console.log('wrote', outJson, fs.statSync(outJson).size, 'bytes');
