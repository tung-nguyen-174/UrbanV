/**
 * src/taxonomy.ts  (v2, approved legend + colour groups for the 2030 Thanh Hoa map)
 *
 * Single source of truth for land-use codes, legend colour groups, result states,
 * thresholds and fixed copy. Legend, chips, popups, labels and map colours must
 * import from here. Never hardcode codes, names or colours anywhere else. See SPEC.md.
 *
 * IMPORTANT: on the source map, many codes share ONE fill colour. The map layer is
 * therefore coloured by `legend_group` (the colour group), not by `category_code`.
 * A feature with category_code === null is "unresolved": we know its colour group
 * but not its exact code. It must show the group's `unresolvedTextVi`.
 */

// ---------------------------------------------------------------------------
// Land-use codes
// ---------------------------------------------------------------------------

export type CodeSource = 'legend' | 'map-only';

export interface LandUseClass {
  code: string;
  nameVi: string;
  /** Colour group this code is drawn in on the source map. */
  group: LegendGroupId | null;
  /** 'legend' = listed in the map legend. 'map-only' = appears on the map, not in legend. */
  source: CodeSource;
  /** True = meaning must be confirmed against the circular used for the map. */
  verify?: boolean;
  /** One plain-language sentence for the result card. Only set where it has been written. */
  plainVi?: string;
}

export type LegendGroupId =
  | 'ODT'
  | 'SALMON'
  | 'LUC_LUA'
  | 'HNK'
  | 'CLN'
  | 'AQUA_NTS_MNC'
  | 'RPH'
  | 'RDD'
  | 'RSX'
  | 'CQP_CAN'
  | 'SKS_DRA'
  | 'NTD';

const L = (code: string, nameVi: string, group: LegendGroupId | null, plainVi?: string): LandUseClass =>
  ({ code, nameVi, group, source: 'legend', ...(plainVi ? { plainVi } : {}) });
const M = (code: string, nameVi: string, group: LegendGroupId | null): LandUseClass =>
  ({ code, nameVi, group, source: 'map-only', verify: true });

export const LAND_USE_LIST: readonly LandUseClass[] = [
  // --- in the map legend ---
  L('LUA', 'Đất trồng lúa', 'LUC_LUA'),
  L('LUC', 'Đất chuyên trồng lúa nước', 'LUC_LUA'),
  L('HNK', 'Đất trồng cây hằng năm khác', 'HNK', 'Đất trồng cây hằng năm, không phải lúa.'),
  L('CLN', 'Đất trồng cây lâu năm', 'CLN', 'Đất trồng cây lâu năm như cây ăn quả, cây công nghiệp.'),
  L('NTS', 'Đất nuôi trồng thủy sản', 'AQUA_NTS_MNC'),
  L('RPH', 'Đất rừng phòng hộ', 'RPH'),
  L('RDD', 'Đất rừng đặc dụng', 'RDD'),
  L('RSX', 'Đất rừng sản xuất', 'RSX'),
  L('CQP', 'Đất quốc phòng', 'CQP_CAN'),
  L('CAN', 'Đất an ninh', 'CQP_CAN'),
  L('SKK', 'Đất khu công nghiệp', 'SALMON'),
  L('SKN', 'Đất cụm công nghiệp', 'SALMON'),
  L('SKC', 'Đất cơ sở sản xuất kinh doanh', 'SALMON'),
  L('SKS', 'Đất sử dụng cho hoạt động khoáng sản', 'SKS_DRA'),
  L('TMD', 'Đất thương mại, dịch vụ', 'SALMON'),
  L('DHT', 'Đất phát triển hạ tầng', 'SALMON'),
  L('DDT', 'Đất di tích danh thắng', 'SALMON'),
  L('DDL', 'Đất danh lam thắng cảnh', 'SALMON'),
  L('DRA', 'Đất bãi thải, xử lý chất thải', 'SKS_DRA'),
  L('ODT', 'Đất ở tại đô thị', 'ODT', 'Đất dành để xây nhà ở trong khu vực đô thị.'),
  L('TSC', 'Đất trụ sở cơ quan', 'SALMON'),
  L('DTS', 'Đất công trình sự nghiệp', 'SALMON'),
  L('TON', 'Đất cơ sở tôn giáo', 'SALMON'),
  L('NTD', 'Đất nghĩa trang, nghĩa địa', 'NTD', 'Đất dùng làm nghĩa trang, nghĩa địa.'),
  L('PNK', 'Đất phi nông nghiệp còn lại', 'SALMON'),
  L('DYT', 'Đất cơ sở y tế', 'SALMON'),
  L('DGD', 'Đất cơ sở giáo dục và đào tạo', 'SALMON'),
  L('DTT', 'Đất cơ sở thể dục, thể thao', 'SALMON'),
  L('CSD', 'Đất chưa sử dụng', null),
  // --- seen on the map, not in the legend: meaning to be confirmed ---
  M('DKV', 'Đất khu vui chơi, giải trí công cộng (công viên)', 'SALMON'),
  M('DVH', 'Đất cơ sở văn hóa', 'SALMON'),
  M('DCH', 'Đất chợ', 'SALMON'),
  M('DXH', 'Đất cơ sở dịch vụ xã hội', 'SALMON'),
  M('DBV', 'Đất công trình bưu chính, viễn thông', 'SALMON'),
  M('NKH', 'Đất nông nghiệp khác', null),
  M('MNC', 'Đất mặt nước chuyên dùng', 'AQUA_NTS_MNC'),
  M('SON', 'Đất sông, ngòi, kênh, rạch, suối', 'AQUA_NTS_MNC'),
  M('DGT', 'Đất giao thông', null),
  M('ONT', 'Đất ở tại nông thôn', 'ODT'),
];

export const LAND_USE: Record<string, LandUseClass> = Object.fromEntries(
  LAND_USE_LIST.map((c) => [c.code, c]),
);
export const LAND_USE_CODES: readonly string[] = LAND_USE_LIST.map((c) => c.code);

export function getLandUse(code: string | null | undefined): LandUseClass | null {
  if (!code) return null;
  return LAND_USE[code] ?? null;
}
export function isLandUseCode(code: unknown): code is string {
  return typeof code === 'string' && code in LAND_USE;
}
/** "ODT · Đất ở tại đô thị". Always show code with the full name. */
export function landUseLabel(code: string | null | undefined): string {
  const c = getLandUse(code);
  return c ? `${c.code} · ${c.nameVi}` : 'Chưa xác định loại đất';
}

// ---------------------------------------------------------------------------
// Legend colour groups (these are what the map is coloured by)
// Fill colours are the exact colours printed on the source map's legend.
// ---------------------------------------------------------------------------

export type PatternId = 'solid' | 'diagonal' | 'dots' | 'cross' | 'horizontal' | 'vertical' | 'grid' | 'waves' | 'diamond';

export interface LegendGroup {
  id: LegendGroupId;
  /** Short name for the legend panel. */
  nameVi: string;
  /** Fill colour = colour printed on the source map (legend swatch). */
  color: string;
  /** Darker outline derived for readability. */
  outline: string;
  pattern: PatternId;
  glyph: string;
  /** If true, the group maps to a single code, so features can be resolved without reading labels. */
  singleCode: string | null;
  /** Text for the result card when category_code is null. */
  unresolvedTextVi: string;
}

function darken(hex: string, f = 0.55): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}
const G = (
  id: LegendGroupId, nameVi: string, color: string, pattern: PatternId, glyph: string,
  singleCode: string | null, unresolvedTextVi: string,
): LegendGroup => ({ id, nameVi, color, outline: darken(color), pattern, glyph, singleCode, unresolvedTextVi });

export const LEGEND_GROUPS: Record<LegendGroupId, LegendGroup> = {
  ODT: G('ODT', 'Đất ở đô thị (ODT)', '#FFA0FF', 'solid', '⌂', 'ODT', 'Đất ở tại đô thị (ODT)'),
  SALMON: G('SALMON', 'Đất phi nông nghiệp khác', '#FFAAA0', 'diagonal', '▣', null,
    'Đất phi nông nghiệp khác, chưa phân loại chi tiết'),
  LUC_LUA: G('LUC_LUA', 'Đất trồng lúa (LUA/LUC)', '#FFFF64', 'dots', '❋', null,
    'Đất trồng lúa, chưa phân loại chi tiết'),
  HNK: G('HNK', 'Đất trồng cây hằng năm khác (HNK)', '#FFF0B4', 'horizontal', '❦', 'HNK',
    'Đất trồng cây hằng năm khác (HNK)'),
  CLN: G('CLN', 'Đất trồng cây lâu năm (CLN)', '#FFD7AA', 'grid', '❦', 'CLN',
    'Đất trồng cây lâu năm (CLN)'),
  AQUA_NTS_MNC: G('AQUA_NTS_MNC', 'Mặt nước / nuôi trồng thủy sản', '#AAFFFF', 'waves', '≈', null,
    'Mặt nước hoặc đất nuôi trồng thủy sản, chưa phân loại chi tiết'),
  RPH: G('RPH', 'Đất rừng phòng hộ (RPH)', '#BEFF1E', 'vertical', '♣', 'RPH', 'Đất rừng phòng hộ (RPH)'),
  RDD: G('RDD', 'Đất rừng đặc dụng (RDD)', '#6EFF64', 'cross', '♣', 'RDD', 'Đất rừng đặc dụng (RDD)'),
  RSX: G('RSX', 'Đất rừng sản xuất (RSX)', '#B4FFB4', 'diamond', '♣', 'RSX', 'Đất rừng sản xuất (RSX)'),
  CQP_CAN: G('CQP_CAN', 'Đất quốc phòng / an ninh', '#FF505A', 'cross', '★', null,
    'Đất quốc phòng hoặc an ninh, chưa phân loại chi tiết'),
  SKS_DRA: G('SKS_DRA', 'Đất khoáng sản / bãi thải', '#CDAACD', 'diamond', '◆', null,
    'Đất khoáng sản hoặc bãi thải, chưa phân loại chi tiết'),
  NTD: G('NTD', 'Đất nghĩa trang (NTD)', '#D2D2D2', 'vertical', '✝', 'NTD', 'Đất nghĩa trang, nghĩa địa (NTD)'),
};
export const LEGEND_GROUP_IDS = Object.keys(LEGEND_GROUPS) as LegendGroupId[];

export function getGroup(id: string | null | undefined): LegendGroup | null {
  if (!id) return null;
  return (LEGEND_GROUPS as Record<string, LegendGroup>)[id] ?? null;
}

/** Minimal shape of a feature's properties that taxonomy helpers need. */
export interface PlanProps {
  category_code?: string | null;
  legend_group?: string | null;
  review_status?: string;
  last_checked?: string | null;
  accuracy_m?: number | null;
}

/** True if the exact code is known (not just the colour group). */
export function isResolved(p: PlanProps | null | undefined): boolean {
  return !!p && isLandUseCode(p.category_code);
}

/** Text for the result card. Unresolved features show the group's fixed text. */
export function featureTitleVi(p: PlanProps | null | undefined): string {
  if (!p) return 'Chưa xác định loại đất';
  if (isResolved(p)) return landUseLabel(p.category_code);
  return getGroup(p.legend_group)?.unresolvedTextVi ?? 'Chưa xác định loại đất';
}

/** Short on-map label: the code if resolved, otherwise none (legend explains the colour). */
export function mapLabel(p: PlanProps | null | undefined): string {
  return isResolved(p) ? (p!.category_code as string) : '';
}

/** MapLibre expressions: colour by legend_group, never by category_code. */
export function fillColorExpression(): unknown[] {
  const e: unknown[] = ['match', ['get', 'legend_group']];
  for (const id of LEGEND_GROUP_IDS) e.push(id, LEGEND_GROUPS[id].color);
  e.push('#C7C7CC');
  return e;
}
export function outlineColorExpression(): unknown[] {
  const e: unknown[] = ['match', ['get', 'legend_group']];
  for (const id of LEGEND_GROUP_IDS) e.push(id, LEGEND_GROUPS[id].outline);
  e.push('#636366');
  return e;
}

// ---------------------------------------------------------------------------
// Result states (exactly four). No "safe", "legal" or "guaranteed" wording.
// ---------------------------------------------------------------------------

export type ResultStatus = 'fit' | 'caution' | 'uncertain' | 'nodata';

export interface StatusInfo {
  id: ResultStatus; icon: string; labelVi: string; sentenceVi: string; color: string; outline: string;
}
export const STATUS: Record<ResultStatus, StatusInfo> = {
  fit: { id: 'fit', icon: '✓', labelVi: 'Phù hợp quy hoạch',
    sentenceVi: 'Vị trí này nằm trong vùng quy hoạch theo dữ liệu đã được duyệt.', color: '#34C759', outline: '#1B7F37' },
  caution: { id: 'caution', icon: '!', labelVi: 'Cần lưu ý',
    sentenceVi: 'Có đường quy hoạch, hành lang hoặc phiên bản dự thảo có thể ảnh hưởng đến vị trí này.', color: '#FFCC00', outline: '#8A6D00' },
  uncertain: { id: 'uncertain', icon: '?', labelVi: 'Không chắc chắn, cần xác minh',
    sentenceVi: 'Dữ liệu chưa đủ để kết luận chắc chắn cho vị trí này. Hãy xác minh với cơ quan có thẩm quyền.', color: '#FF9500', outline: '#8A4B00' },
  nodata: { id: 'nodata', icon: '–', labelVi: 'Chưa có dữ liệu',
    sentenceVi: 'Chưa có dữ liệu quy hoạch cho vị trí này.', color: '#8E8E93', outline: '#48484A' },
};

// ---------------------------------------------------------------------------
// Thresholds (assumptions: tune after measuring real error at the pilot)
// ---------------------------------------------------------------------------

export const THRESHOLDS = { BOUNDARY_UNCERTAIN_M: 30, STALE_MONTHS: 12 } as const;

export function isStale(lastChecked: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastChecked) return true;
  const d = new Date(lastChecked);
  if (Number.isNaN(d.getTime())) return true;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - THRESHOLDS.STALE_MONTHS);
  return d < cutoff;
}
export function boundaryThresholdM(accuracyM?: number | null): number {
  const a = typeof accuracyM === 'number' && accuracyM > 0 ? accuracyM : 0;
  return Math.max(THRESHOLDS.BOUNDARY_UNCERTAIN_M, a);
}

// ---------------------------------------------------------------------------
// Review gate and "can this feature ever be 'fit'?" rules
// ---------------------------------------------------------------------------

export type ReviewStatus = 'draft' | 'reviewed' | 'approved';

/** Only approved features are used, except in preview mode (see SPEC.md rule 6). */
export function isPublishable(p: { review_status?: string } | null | undefined, previewDraft = false): boolean {
  if (!p) return false;
  if (p.review_status === 'approved') return true;
  return previewDraft && (p.review_status === 'draft' || p.review_status === 'reviewed');
}

/** A document is "verified" only when its number and effective date are both filled in. */
export function isDocumentVerified(doc: { number?: string; effective_date?: string } | null | undefined): boolean {
  return !!doc && !!doc.number && !!doc.effective_date;
}

/**
 * Highest status a match is allowed to produce:
 *  - not approved                    -> 'uncertain'
 *  - unresolved code (colour only)   -> 'uncertain'
 *  - document not verified           -> 'uncertain'
 *  - otherwise                       -> 'fit'
 * `transitional` does NOT lower the status; it adds a note (COPY.transitionalVi).
 */
export function maxStatusFor(
  p: PlanProps,
  doc: { number?: string; effective_date?: string } | null | undefined,
): { max: ResultStatus; reasons: string[] } {
  const reasons: string[] = [];
  if (p.review_status !== 'approved') reasons.push(COPY.notApprovedVi);
  if (!isResolved(p)) reasons.push(COPY.unresolvedReasonVi);
  if (!isDocumentVerified(doc)) reasons.push(COPY.docUnverifiedVi);
  return { max: reasons.length ? 'uncertain' : 'fit', reasons };
}

// ---------------------------------------------------------------------------
// Fixed copy
// ---------------------------------------------------------------------------

export const COPY = {
  disclaimerVi: 'Kết quả chỉ mang tính tham khảo. Giá trị pháp lý thuộc văn bản của cơ quan có thẩm quyền.',
  pilotBadgeVi: 'Thí điểm · Phường Hạc Thành · dữ liệu đang được số hóa',
  draftBannerVi: 'BẢN NHÁP, chưa được duyệt',
  outOfPilotVi: 'Ngoài phạm vi thí điểm (hiện chỉ có Phường Hạc Thành).',
  noPlanInWardVi: 'Vị trí nằm trong Phường Hạc Thành nhưng chưa có dữ liệu quy hoạch đã duyệt cho điểm này.',
  osmAttributionVi: '© OpenStreetMap contributors',
  transitionalVi: 'Quy hoạch chuyển tiếp (lập trước 01/07/2025)',
  notApprovedVi: 'Dữ liệu đang là bản nháp, chưa được duyệt',
  unresolvedReasonVi: 'Chưa phân loại chi tiết (mới biết nhóm màu trên bản đồ)',
  docUnverifiedVi: 'Chưa xác nhận số và ngày hiệu lực của văn bản phê duyệt bản đồ này',
  mapSourceNoteVi: 'Nguồn: bản đồ quy hoạch sử dụng đất đến 2030, bản in 10/09/2021, chưa rõ số quyết định phê duyệt',
  reportButtonVi: 'Báo dữ liệu chưa đúng',
  viewSourceVi: 'Xem văn bản gốc',
  noOfficialLinkVi: 'Chưa có liên kết chính thức',
  lastUpdatedVi: 'Cập nhật lần cuối',
  effectiveFromVi: 'Có hiệu lực từ',
  unknownVi: 'Chưa có',
  verifyTitleVi: 'Cách xác minh',
  verifyHowVi: 'Mang theo vị trí đã chia sẻ và liên hệ UBND Phường Hạc Thành hoặc cơ quan quản lý quy hoạch của tỉnh Thanh Hóa để xác minh.',
  adminPathVi: 'Tỉnh Thanh Hóa › Phường Hạc Thành',
  oldNamesVi: 'Tên cũ',
} as const;

/** Paste into the Gemini response schema as the `enum` for category_code (offline use). */
export const GEMINI_CATEGORY_ENUM: readonly string[] = [...LAND_USE_CODES, 'UNKNOWN'];
