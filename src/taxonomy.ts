/**
 * src/taxonomy.ts
 * Single source of truth for land-use codes, result states and thresholds.
 * Legend, filter chips, popups, labels and Gemini prompts must import from here.
 * Never hardcode codes, names or colours anywhere else. See SPEC.md.
 *
 * Codes follow Thông tư 08/2024/TT-BTNMT. Codes marked verify:true
 * must be re-checked against the circular before public launch.
 */

// ---------------------------------------------------------------------------
// Land-use classes
// ---------------------------------------------------------------------------

export const LAND_USE_CODES = [
  'ODT',
  'ONT',
  'TMD',
  'SKK',
  'DGD',
  'DGT',
  'DKV',
  'CLN',
  'TSC',
] as const;

export type LandUseCode = (typeof LAND_USE_CODES)[number];

/** Fill patterns so colour is never the only signal (colour-blind safe). */
export type PatternId =
  | 'solid'
  | 'diagonal'
  | 'dots'
  | 'cross'
  | 'horizontal'
  | 'vertical'
  | 'grid'
  | 'waves'
  | 'diamond';

export interface LandUseClass {
  code: LandUseCode;
  /** Full Vietnamese name. Always shown together with the code. */
  nameVi: string;
  /** Short plain-language description for the user card. */
  plainVi: string;
  /** Fill / legend colour. A hint only: the code is the legal standard. */
  color: string;
  /** Darker colour for outlines and text on light backgrounds. */
  outline: string;
  pattern: PatternId;
  /** Short symbol shown next to the code in the legend. */
  glyph: string;
  /** True = double-check this code against the circular before launch. */
  verify?: boolean;
}

export const LAND_USE: Record<LandUseCode, LandUseClass> = {
  ODT: {
    code: 'ODT',
    nameVi: 'Đất ở tại đô thị',
    plainVi: 'Đất để ở trong khu vực đô thị.',
    color: '#D16F6D',
    outline: '#A64846',
    pattern: 'solid',
    glyph: '⌂',
  },
  ONT: {
    code: 'ONT',
    nameVi: 'Đất ở tại nông thôn',
    plainVi: 'Đất để ở trong khu vực nông thôn.',
    color: '#FF8A80',
    outline: '#A8332B',
    pattern: 'dots',
    glyph: '⌂',
  },
  TMD: {
    code: 'TMD',
    nameVi: 'Đất thương mại, dịch vụ',
    plainVi: 'Đất dành cho kinh doanh, cửa hàng, dịch vụ.',
    color: '#F4BA43',
    outline: '#BA841C',
    pattern: 'diagonal',
    glyph: '₫',
  },
  SKK: {
    code: 'SKK',
    nameVi: 'Đất khu công nghiệp',
    plainVi: 'Đất dành cho khu công nghiệp.',
    color: '#6D84C8',
    outline: '#455C9C',
    pattern: 'cross',
    glyph: '⚙',
  },
  DGD: {
    code: 'DGD',
    nameVi: 'Đất cơ sở giáo dục và đào tạo',
    plainVi: 'Đất dành cho trường học, cơ sở đào tạo.',
    color: '#81BADF',
    outline: '#4F87A8',
    pattern: 'horizontal',
    glyph: '✎',
  },
  DGT: {
    code: 'DGT',
    nameVi: 'Đất giao thông',
    plainVi: 'Đất dành cho đường và công trình giao thông.',
    color: '#A0A0A0',
    outline: '#6B6B6B',
    pattern: 'vertical',
    glyph: '⇄',
  },
  DKV: {
    code: 'DKV',
    nameVi: 'Đất khu vui chơi, giải trí công cộng (công viên)',
    plainVi: 'Công viên, quảng trường, khu vui chơi công cộng.',
    color: '#30D158',
    outline: '#1B7F37',
    pattern: 'waves',
    glyph: '❀',
  },
  CLN: {
    code: 'CLN',
    nameVi: 'Đất trồng cây lâu năm',
    plainVi: 'Đất trồng cây lâu năm (không phải công viên).',
    color: '#A9D18E',
    outline: '#6F9A52',
    pattern: 'grid',
    glyph: '❦',
  },
  TSC: {
    code: 'TSC',
    nameVi: 'Đất xây dựng trụ sở cơ quan',
    plainVi: 'Đất dành cho trụ sở cơ quan nhà nước.',
    color: '#007AFF',
    outline: '#0040A0',
    pattern: 'diamond',
    glyph: '▣',
    verify: true,
  },
};

/** Safe lookup. Unknown or missing codes never crash the UI or get guessed. */
export function getLandUse(code: string | null | undefined): LandUseClass | null {
  if (!code) return null;
  return (LAND_USE as Record<string, LandUseClass>)[code] ?? null;
}

export function isLandUseCode(code: unknown): code is LandUseCode {
  return typeof code === 'string' && (LAND_USE_CODES as readonly string[]).includes(code);
}

/** Label like "ODT · Đất ở tại đô thị". Always show code with the full name. */
export function landUseLabel(code: string | null | undefined): string {
  const c = getLandUse(code);
  return c ? `${c.code} · ${c.nameVi}` : 'Chưa xác định loại đất';
}

/** MapLibre match expressions built from the taxonomy (no hardcoded colours in map code). */
export function colorMatchExpression(): unknown[] {
  const expr: unknown[] = ['match', ['get', 'category_code']];
  for (const code of LAND_USE_CODES) expr.push(code, LAND_USE[code].color);
  expr.push('#C7C7CC'); // fallback for unknown codes
  return expr;
}

export function outlineMatchExpression(): unknown[] {
  const expr: unknown[] = ['match', ['get', 'category_code']];
  for (const code of LAND_USE_CODES) expr.push(code, LAND_USE[code].outline);
  expr.push('#636366');
  return expr;
}

// ---------------------------------------------------------------------------
// Result states (exactly four). No "safe", "legal" or "guaranteed" wording.
// ---------------------------------------------------------------------------

export type ResultStatus = 'fit' | 'caution' | 'uncertain' | 'nodata';

export interface StatusInfo {
  id: ResultStatus;
  icon: string;
  labelVi: string;
  /** Default one-line answer. Components may add specifics (zone, distance). */
  sentenceVi: string;
  color: string;
  outline: string;
}

export const STATUS: Record<ResultStatus, StatusInfo> = {
  fit: {
    id: 'fit',
    icon: '✓',
    labelVi: 'Phù hợp quy hoạch',
    sentenceVi: 'Vị trí này nằm trong vùng quy hoạch theo dữ liệu đã được duyệt.',
    color: '#34C759',
    outline: '#1B7F37',
  },
  caution: {
    id: 'caution',
    icon: '!',
    labelVi: 'Cần lưu ý',
    sentenceVi: 'Có đường quy hoạch, hành lang hoặc phiên bản dự thảo có thể ảnh hưởng đến vị trí này.',
    color: '#FFCC00',
    outline: '#8A6D00',
  },
  uncertain: {
    id: 'uncertain',
    icon: '?',
    labelVi: 'Không chắc chắn, cần xác minh',
    sentenceVi: 'Vị trí gần ranh giới hoặc dữ liệu đã cũ. Hãy xác minh với cơ quan có thẩm quyền.',
    color: '#FF9500',
    outline: '#8A4B00',
  },
  nodata: {
    id: 'nodata',
    icon: '–',
    labelVi: 'Chưa có dữ liệu',
    sentenceVi: 'Chưa có dữ liệu quy hoạch cho vị trí này.',
    color: '#8E8E93',
    outline: '#48484A',
  },
};

// ---------------------------------------------------------------------------
// Thresholds. ASSUMPTIONS: tune after measuring real error at the pilot.
// ---------------------------------------------------------------------------

export const THRESHOLDS = {
  /** Closer than this to a feature boundary (metres) => "uncertain". */
  BOUNDARY_UNCERTAIN_M: 30,
  /** Data older than this (months) => "uncertain". */
  STALE_MONTHS: 12,
} as const;

/** True if last_checked (YYYY-MM-DD) is older than the freshness threshold. */
export function isStale(lastChecked: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastChecked) return true; // unknown freshness is treated as stale
  const d = new Date(lastChecked);
  if (Number.isNaN(d.getTime())) return true;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - THRESHOLDS.STALE_MONTHS);
  return d < cutoff;
}

/**
 * Effective "too close to boundary" distance for a feature:
 * the larger of the global threshold and the feature's own measured accuracy.
 */
export function boundaryThresholdM(accuracyM?: number | null): number {
  const a = typeof accuracyM === 'number' && accuracyM > 0 ? accuracyM : 0;
  return Math.max(THRESHOLDS.BOUNDARY_UNCERTAIN_M, a);
}

// ---------------------------------------------------------------------------
// Review gate and fixed copy
// ---------------------------------------------------------------------------

export type ReviewStatus = 'draft' | 'reviewed' | 'approved';

/** Only approved features are ever rendered or used for lookup. */
export function isPublishable(props: { review_status?: string } | null | undefined): boolean {
  return props?.review_status === 'approved';
}

export const COPY = {
  disclaimerVi:
    'Kết quả chỉ mang tính tham khảo. Giá trị pháp lý thuộc văn bản của cơ quan có thẩm quyền.',
  pilotBadgeVi: 'Thí điểm · Phường Hạc Thành · dữ liệu đang được số hóa',
  draftBannerVi: 'BẢN NHÁP, chưa được duyệt',
  outOfPilotVi: 'Ngoài phạm vi thí điểm (hiện chỉ có Phường Hạc Thành).',
  noPlanInWardVi: 'Vị trí nằm trong Phường Hạc Thành nhưng chưa có dữ liệu quy hoạch đã duyệt cho điểm này.',
  osmAttributionVi: '© OpenStreetMap contributors',
  transitionalVi: 'Quy hoạch chuyển tiếp (lập trước 01/07/2025)',
  reportButtonVi: 'Báo dữ liệu chưa đúng',
  viewSourceVi: 'Xem văn bản gốc',
  lastUpdatedVi: 'Cập nhật lần cuối',
  effectiveFromVi: 'Có hiệu lực từ',
} as const;

// ---------------------------------------------------------------------------
// Gemini helper (offline use in AI Studio): enum for the response schema
// ---------------------------------------------------------------------------

/** Paste into the Gemini response schema as the `enum` for category_code. */
export const GEMINI_CATEGORY_ENUM: readonly string[] = [...LAND_USE_CODES, 'UNKNOWN'];
