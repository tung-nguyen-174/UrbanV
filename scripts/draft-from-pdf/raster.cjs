// Minimal PDF vector rasteriser (fills + thin strokes) for previewing content streams. No dependencies.
// Usage: node raster.cjs <pdf> <outPrefix> <widthPx> [minOps]
// Renders each content stream that contains path operators to <outPrefix>_<k>.png.
const fs = require('fs'), zlib = require('zlib');
const [file, outPrefix, widthArg, minOpsArg] = process.argv.slice(2);
const W = Number(widthArg || 1200);
const minOps = Number(minOpsArg || 500);
const buf = fs.readFileSync(file);
const latin = buf.toString('latin1');

// Page size from the first MediaBox
const mb = latin.match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/);
const [X0, Y0, X1, Y1] = mb ? mb.slice(1).map(Number) : [0, 0, 612, 792];
const S = W / (X1 - X0);
const H = Math.round((Y1 - Y0) * S);

// Collect content streams (inflated)
const streams = [];
const re = /stream\r?\n/g;
let m;
while ((m = re.exec(latin))) {
  if (latin.slice(m.index - 3, m.index) === 'end') continue;
  const start = m.index + m[0].length;
  const end = latin.indexOf('endstream', start);
  if (end < 0) break;
  let data;
  try { data = zlib.inflateSync(buf.subarray(start, end)); } catch { continue; }
  const s = data.toString('latin1');
  const ops = (s.match(/(^|\s)(m|l|c|re|f|f\*|S)(?=\s)/g) || []).length;
  if (ops >= minOps) streams.push({ data: s, ops });
}

function hexToRGB(r, g, b) { return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]; }

function renderStream(s, outFile) {
  const img = Buffer.alloc(W * H * 3, 255);
  const fillPolys = []; // deferred: [{pts, rule, rgb}]
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let fill = [0, 0, 0], stroke = [0, 0, 0];
  let path = [];   // current subpath points in user space (after ctm)
  let subs = [];   // list of subpaths
  let cur = null;
  const nums = [];
  const toDev = (x, y) => {
    const [a, b, c, d, e, f] = ctm;
    const ux = a * x + c * y + e, uy = b * x + d * y + f;
    return [(ux - X0) * S, (Y1 - uy) * S];
  };
  let lastUser = [0, 0]; // current point in user space (needed by curve start points)
  const pushPt = (x, y) => { if (!cur) { cur = []; subs.push(cur); } cur.push(toDev(x, y)); lastUser = [x, y]; };
  const paint = (rule, doFill, doStroke) => {
    if (doFill && subs.length) {
      const pts = subs.filter((p) => p.length > 2);
      if (pts.length) fillPolys.push({ subs: pts, rule, rgb: fill });
    }
    if (doStroke) {
      for (const p of subs) for (let i = 1; i < p.length; i++) fillPolys.push({ line: [p[i - 1], p[i]], rgb: stroke });
    }
    subs = []; cur = null;
  };
  const tokens = s.split(/\s+/);
  for (const t of tokens) {
    if (t === '') continue;
    if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) { nums.push(parseFloat(t)); continue; }
    const k = nums.length;
    switch (t) {
      case 'q': stack.push([...ctm, fill, stroke]); break;
      case 'Q': { const st = stack.pop(); if (st) { ctm = st.slice(0, 6); fill = st[6]; stroke = st[7]; } break; }
      case 'cm': if (k >= 6) { const [a, b, c, d, e, f] = nums.slice(-6); const [A, B, C, D, E, F] = ctm;
        ctm = [a * A + b * C, a * B + b * D, c * A + d * C, c * B + d * D, e * A + f * C + E, e * B + f * D + F]; } break;
      case 'rg': if (k >= 3) fill = hexToRGB(...nums.slice(-3)); break;
      case 'RG': if (k >= 3) stroke = hexToRGB(...nums.slice(-3)); break;
      case 'g': if (k >= 1) fill = hexToRGB(nums[k - 1], nums[k - 1], nums[k - 1]); break;
      case 'm': if (k >= 2) { cur = null; pushPt(nums[k - 2], nums[k - 1]); } break;
      case 'l': if (k >= 2) pushPt(nums[k - 2], nums[k - 1]); break;
      case 'c': if (k >= 6) {
        const [x0p, y0p] = lastUser;
        const [x1p, y1p, x2p, y2p, x3p, y3p] = nums.slice(-6);
        for (let i = 1; i <= 8; i++) {
          const u = i / 8, v = 1 - u;
          const x = v * v * v * x0p + 3 * v * v * u * x1p + 3 * v * u * u * x2p + u * u * u * x3p;
          const y = v * v * v * y0p + 3 * v * v * u * y1p + 3 * v * u * u * y2p + u * u * u * y3p;
          pushPt(x, y);
        }
      } break;
      case 're': if (k >= 4) { const [x, y, w, h] = nums.slice(-4); cur = null; pushPt(x, y); pushPt(x + w, y); pushPt(x + w, y + h); pushPt(x, y + h); cur = null; } break;
      case 'h': cur = null; break;
      case 'f': case 'F': paint('nonzero', true, false); break;
      case 'f*': paint('evenodd', true, false); break;
      case 'S': paint('nonzero', false, true); break;
      case 'B': paint('nonzero', true, true); break;
      case 'n': paint('nonzero', false, false); break;
      default: break;
    }
    nums.length = 0;
  }
  // Rasterise: fills by scanline winding, strokes as 1px lines
  const span = new Float64Array(0);
  for (const it of fillPolys) {
    if (it.line) {
      const [[x0, y0], [x1, y1]] = it.line;
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0 || 1;
      for (let i = 0; i <= steps; i++) {
        const px = Math.round(x0 + ((x1 - x0) * i) / steps), py = Math.round(y0 + ((y1 - y0) * i) / steps);
        if (px >= 0 && py >= 0 && px < W && py < H) { const o = (py * W + px) * 3; img[o] = it.rgb[0]; img[o + 1] = it.rgb[1]; img[o + 2] = it.rgb[2]; }
      }
      continue;
    }
    let minY = Infinity, maxY = -Infinity;
    for (const p of it.subs) for (const [, y] of p) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
    minY = Math.max(0, Math.floor(minY)); maxY = Math.min(H - 1, Math.ceil(maxY));
    for (let py = minY; py <= maxY; py++) {
      const yc = py + 0.5;
      const xs = [];
      for (const p of it.subs) {
        for (let i = 0; i < p.length; i++) {
          const [ax, ay] = p[i], [bx, by] = p[(i + 1) % p.length];
          if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
            const x = ax + ((yc - ay) * (bx - ax)) / (by - ay);
            xs.push([x, by > ay ? 1 : -1]);
          }
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a[0] - b[0]);
      let wind = 0;
      for (let i = 0; i < xs.length - 1; i++) {
        wind += xs[i][1];
        const inside = it.rule === 'evenodd' ? (i % 2 === 0) : wind !== 0;
        if (!inside) continue;
        const xa = Math.max(0, Math.ceil(xs[i][0] - 0.5)), xb = Math.min(W - 1, Math.floor(xs[i + 1][0] - 0.5));
        for (let px = xa; px <= xb; px++) {
          const o = (py * W + px) * 3;
          img[o] = it.rgb[0]; img[o + 1] = it.rgb[1]; img[o + 2] = it.rgb[2];
        }
      }
    }
  }
  writePNG(outFile, img, W, H);
  return fillPolys.length;
}

function writePNG(file, rgb, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

console.log('page box', X0, Y0, X1, Y1, 'raster', W, 'x', H, 'content streams', streams.length, streams.map((s) => s.ops));
streams.forEach((s, i) => {
  const out = `${outPrefix}_${i}.png`;
  const n = renderStream(s.data, out);
  console.log('rendered', out, 'items', n);
});
