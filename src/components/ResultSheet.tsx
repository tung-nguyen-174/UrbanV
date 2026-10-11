import React, { useEffect, useRef, useState } from 'react';
import {
  Share2,
  Bookmark,
  AlertTriangle,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
  Check,
  FileText,
  Calendar,
  Clock,
  Building,
} from 'lucide-react';
import {
  STATUS,
  COPY,
  featureTitleVi,
  getGroup,
  getLandUse,
  isDocumentVerified,
} from '../taxonomy';
import type {
  AdminUnit,
  DocumentRecord,
  LookupResult,
  PlanningFeature,
  PlanningFeatureProperties,
} from '../types';
import { computeAreaHa, savePlaceLocally } from '../lib/data';

/** Colour swatch + glyph of the feature's legend group (colour is never the only signal). */
const GroupSwatch: React.FC<{ legendGroup?: string | null }> = ({ legendGroup }) => {
  const group = getGroup(legendGroup);
  if (!group) return null;
  return (
    <span
      aria-hidden="true"
      className="w-5 h-5 rounded-md shrink-0 inline-flex items-center justify-center text-[11px] leading-none text-black"
      style={{ backgroundColor: group.color, border: `1.5px solid ${group.outline}` }}
    >
      {group.glyph}
    </span>
  );
};

/** Title line for one match: swatch + featureTitleVi. */
const MatchTitle: React.FC<{ props: PlanningFeatureProperties; className?: string }> = ({
  props,
  className,
}) => (
  <span className={`flex items-center gap-2 ${className ?? ''}`}>
    <GroupSwatch legendGroup={props.legend_group} />
    <span>{featureTitleVi(props)}</span>
  </span>
);

/** ISO yyyy-mm-dd -> dd/mm/yyyy; anything else (empty, malformed) -> COPY.unknownVi. */
export function formatDateVi(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return COPY.unknownVi;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Only http(s) links are shown as "Xem văn bản gốc". */
function safeOfficialUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : null;
}

interface ResultSheetProps {
  result: LookupResult | null;
  documents: DocumentRecord[];
  adminUnits: AdminUnit[];
  onOpenReport: () => void;
  onClose: () => void;
  /** Reports the sheet's height in px once it has finished snapping (0 when hidden). */
  onHeightChange?: (px: number) => void;
}

export type SnapState = 'collapsed' | 'half' | 'full';

export const ResultSheet: React.FC<ResultSheetProps> = ({
  result,
  documents,
  adminUnits,
  onOpenReport,
  onHeightChange,
}) => {
  const [snap, setSnap] = useState<SnapState>('half');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const sheetRef = useRef<HTMLElement>(null);

  // Report the height after each snap change has finished animating (transition is 300 ms)
  const hasResult = result !== null;
  useEffect(() => {
    if (!onHeightChange) return;
    if (!hasResult) {
      onHeightChange(0);
      return;
    }
    const measure = () => {
      if (sheetRef.current) onHeightChange(sheetRef.current.offsetHeight);
    };
    const timer = window.setTimeout(measure, 320);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', measure);
    };
  }, [snap, hasResult, onHeightChange]);

  // Move focus to the sheet title whenever a new result opens
  useEffect(() => {
    if (result) titleRef.current?.focus();
  }, [result]);

  // Escape collapses the sheet
  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && snap !== 'collapsed') setSnap('collapsed');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [result, snap]);

  if (!result) return null;

  const statusInfo = STATUS[result.status];
  const hacThanhAdmin = adminUnits.find((u) => u.id === 'phuong-hac-thanh');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2800);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}${window.location.pathname}#lng=${result.lng.toFixed(6)}&lat=${result.lat.toFixed(6)}`;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        showToast('Đã sao chép liên kết vào bộ nhớ tạm!');
      } else {
        showToast(`Liên kết: ${url}`);
      }
    } catch {
      showToast('Không thể sao chép liên kết tự động.');
    }
  };

  const handleSave = () => {
    const firstMatch = result.matches[0];
    const catCode = firstMatch?.properties?.category_code ?? undefined;
    const label = firstMatch ? featureTitleVi(firstMatch.properties) : result.wardName;

    const ok = savePlaceLocally({
      id: `${result.lng.toFixed(5)}_${result.lat.toFixed(5)}`,
      label,
      lng: result.lng,
      lat: result.lat,
      savedAt: new Date().toISOString(),
      status: result.status,
      categoryCode: catCode,
      note: result.message,
    });

    if (ok) {
      showToast('Đã lưu vị trí này vào thiết bị của bạn!');
    } else {
      showToast('Không thể lưu do bộ nhớ trình duyệt bị khóa.');
    }
  };

  // Find document for a feature
  const findDoc = (docId?: string): DocumentRecord | null => {
    if (!docId) return null;
    return documents.find((d) => d.id === docId) ?? null;
  };

  // Height and transition styling according to snap level
  const heightClass =
    snap === 'collapsed'
      ? 'h-[80px]'
      : snap === 'half'
      ? 'h-[48dvh] max-h-[460px]'
      : 'h-[88dvh] max-h-[92dvh]';

  const primaryMatch: PlanningFeature | undefined = result.matches[0];
  const primaryProps = primaryMatch?.properties;
  const primaryDoc = findDoc(primaryProps?.document_id);
  const primaryOfficialUrl = safeOfficialUrl(primaryDoc?.official_url);

  // One plain sentence: the code's own plainVi when the code is resolved and has one,
  // otherwise the status sentence. Nothing is invented for other codes.
  const plainSentence =
    getLandUse(primaryProps?.category_code)?.plainVi ?? result.message;

  const isAnyTransitional = result.matches.some((m) => m.properties.transitional);
  const predecessors = hacThanhAdmin?.predecessors ?? [];

  return (
    <section
      ref={sheetRef}
      aria-label="Kết quả tra cứu"
      className={`fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-[#0B101D]/95 backdrop-blur-2xl border-t border-slate-200/90 dark:border-white/12 rounded-t-3xl shadow-2xl transition-all duration-300 ease-out flex flex-col pb-[env(safe-area-inset-bottom)] motion-reduce:transition-none ${heightClass}`}
    >
      {/* Polite live region: announces the result when it changes */}
      <div aria-live="polite" className="sr-only">
        {`${statusInfo.labelVi}. ${plainSentence}`}
      </div>

      {/* Toast alert */}
      {toastMessage && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900/90 dark:bg-slate-100/90 text-white dark:text-slate-900 text-xs font-medium rounded-full shadow-lg backdrop-blur-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & Drag/Snap controller */}
      <div className="w-full shrink-0 pt-1 pb-1.5 px-4 select-none">
        {/* Handle: a real button, so keyboard and screen-reader users can change the size */}
        <button
          type="button"
          aria-expanded={snap !== 'collapsed'}
          aria-label="Thay đổi kích thước khung kết quả"
          onClick={() => {
            if (snap === 'collapsed') setSnap('half');
            else if (snap === 'half') setSnap('full');
            else setSnap('half');
          }}
          className="w-full min-h-[48px] flex items-center justify-center cursor-pointer"
        >
          <span aria-hidden="true" className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </button>

        {/* Collapsed top row summary */}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-3 min-w-0">
            {/* Status indicator badge (icon + text label; colour is never the only signal) */}
            <div
              aria-hidden="true"
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-base shadow-xs"
              style={{
                backgroundColor: statusInfo.color,
                border: `1.5px solid ${statusInfo.outline}`,
                color: '#0B101D',
              }}
            >
              <span>{statusInfo.icon}</span>
            </div>

            <div className="min-w-0">
              <h2
                ref={titleRef}
                tabIndex={-1}
                className="text-base font-semibold text-slate-900 dark:text-white truncate outline-none"
              >
                {statusInfo.labelVi}
                {result.matches.some((m) => m.properties.review_status !== 'approved') && (
                  <span className="ml-2 align-middle shrink-0 inline-block rounded-md px-1.5 py-0.5 text-sm font-medium bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200">
                    Bản nháp
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                {primaryMatch ? (
                  <>
                    <GroupSwatch legendGroup={primaryProps?.legend_group} />
                    <span className="truncate">{featureTitleVi(primaryProps)}</span>
                    {result.matches.length > 1 && (
                      <span className="shrink-0">+{result.matches.length - 1}</span>
                    )}
                  </>
                ) : (
                  <span>{result.wardName}</span>
                )}
              </div>
            </div>
          </div>

          {/* Snap toggle buttons */}
          <div className="flex items-center gap-1">
            {snap === 'collapsed' ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSnap('half');
                }}
                className="w-12 h-12 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Mở rộng chi tiết"
              >
                <ChevronUp className="w-5 h-5" />
              </button>
            ) : snap === 'half' ? (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSnap('full');
                  }}
                  className="w-12 h-12 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Xem toàn màn hình"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSnap('collapsed');
                  }}
                  className="w-12 h-12 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Thu nhỏ"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSnap('half');
                }}
                className="w-12 h-12 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Thu nhỏ về nửa màn hình"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Content (visible in half and full), in card order */}
      {snap !== 'collapsed' && (
        <div tabIndex={0} aria-label="Chi tiết kết quả" className="flex-1 overflow-y-auto px-5 py-3 space-y-5">
          {/* 1. One plain sentence (Body text: 16px) */}
          <p className="text-base text-slate-800 dark:text-slate-100 leading-relaxed font-medium">
            {plainSentence}
          </p>

          {/* 2. Land-use label */}
          {primaryMatch && (
            <div className="space-y-1">
              <span className="text-sm text-slate-600">Phân loại đất</span>
              {result.matches.map((m, idx) => (
                <MatchTitle
                  key={m.properties.id || idx}
                  props={m.properties}
                  className="text-base font-semibold text-slate-900 dark:text-white"
                />
              ))}
            </div>
          )}

          {/* 3. Reasons */}
          {result.reasons && result.reasons.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600">
                Căn cứ đánh giá trạng thái
              </h3>
              <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                {result.reasons
                  .filter((r) => !(isAnyTransitional && r === COPY.transitionalVi)) // shown once, as the note below
                  .map((r, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 mt-2 shrink-0" />
                    <span className="leading-snug">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 4. Dates */}
          {primaryProps && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-sm">
              <div>
                <span className="text-slate-600 flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {COPY.effectiveFromVi}
                </span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {formatDateVi(primaryProps.effective_date ?? primaryDoc?.effective_date)}
                </span>
              </div>
              <div>
                <span className="text-slate-600 flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {COPY.lastUpdatedVi}
                </span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {formatDateVi(primaryProps.last_checked)}
                </span>
              </div>
            </div>
          )}

          {/* 5. Document line */}
          {primaryMatch && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 text-sm space-y-2">
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1 min-w-0">
                  <span className="font-semibold text-slate-900 dark:text-white block">
                    {primaryDoc?.title || COPY.unknownVi}
                  </span>
                  <div className="text-slate-600 dark:text-slate-400 text-xs space-y-0.5">
                    <div>Số hiệu: {primaryDoc?.number || COPY.unknownVi}</div>
                    <div>Cơ quan ban hành: {primaryDoc?.authority || COPY.unknownVi}</div>
                    <div>
                      Trang tài liệu căn cứ:{' '}
                      {primaryProps?.source_page ? `Trang ${primaryProps.source_page}` : COPY.unknownVi}
                    </div>
                  </div>
                  {!isDocumentVerified(primaryDoc) && (
                    <p className="text-xs text-amber-700 dark:text-amber-300 leading-snug">
                      {COPY.mapSourceNoteVi}
                    </p>
                  )}
                </div>
              </div>

              {primaryOfficialUrl ? (
                <a
                  href={primaryOfficialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline font-medium text-sm min-h-[36px]"
                >
                  <span>{COPY.viewSourceVi}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <div className="space-y-1">
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-1.5 text-slate-600 font-medium text-sm min-h-[36px] cursor-not-allowed"
                  >
                    <span>{COPY.viewSourceVi}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{COPY.noOfficialLinkVi}</p>
                </div>
              )}
            </div>
          )}

          {/* 6. Administrative path with old names */}
          <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs space-y-2">
            <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-medium">
              <Building className="w-4 h-4 text-slate-500" />
              <span>{COPY.adminPathVi}</span>
            </div>
            {predecessors.length > 0 && (
              <div className="text-slate-500 dark:text-slate-400 leading-relaxed text-xs pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  {COPY.oldNamesVi}:{' '}
                </span>
                <span>{predecessors.join(', ')}</span>
              </div>
            )}
          </div>

          {/* 7. Transitional note */}
          {isAnyTransitional && (
            <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900">
              <strong>Lưu ý:</strong> {COPY.transitionalVi}
            </div>
          )}

          {/* 8. How to verify (uncertain only) */}
          {result.status === 'uncertain' && (
            <div className="p-3 rounded-xl border border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40 text-sm text-slate-800 dark:text-slate-200 space-y-1">
              <h3 className="font-semibold">{COPY.verifyTitleVi}</h3>
              <p className="leading-snug">{COPY.verifyHowVi}</p>
            </div>
          )}

          {/* 9. Disclaimer */}
          <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 rounded-xl border border-amber-200/60 dark:border-amber-900/60 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <p className="leading-snug">{COPY.disclaimerVi}</p>
          </div>

          {/* Full detail view (per-match details and actions) */}
          {snap === 'full' && (
            <div className="space-y-6 pt-2 border-t border-slate-100 dark:border-slate-800">
              {/* Detailed matching zones */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Chi tiết các vùng quy hoạch ({result.matches.length})
                  </h3>
                </div>

                {result.matches.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    Chưa có đối tượng vùng quy hoạch nào được ghi nhận tại vị trí này.
                  </p>
                ) : (
                  result.matches.map((match, mIdx) => {
                    const props = match.properties;
                    const doc = findDoc(props.document_id);
                    const areaHa = computeAreaHa(match);
                    const officialUrl = safeOfficialUrl(doc?.official_url);

                    return (
                      <div
                        key={props.id || mIdx}
                        className="bg-slate-50/80 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200/70 dark:border-slate-700 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[11px] font-mono text-slate-600 block">
                              Mã đối tượng: {props.id}
                            </span>
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                              <MatchTitle props={props} />
                            </h4>
                            {props.category_code == null && (
                              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                Nhóm màu này gồm các mã:{' '}
                                {props.candidate_codes?.length
                                  ? props.candidate_codes.join(', ')
                                  : COPY.unknownVi}
                              </p>
                            )}
                          </div>
                          {areaHa !== null && (
                            <div className="text-right shrink-0">
                              <span className="text-[11px] text-slate-600 block">Diện tích tính toán</span>
                              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                                {areaHa} ha
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Legal document reference */}
                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs space-y-2">
                          <div className="flex items-start gap-2">
                            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                            <div className="space-y-1 flex-1">
                              <span className="font-semibold text-slate-900 dark:text-white block">
                                {doc?.title || COPY.unknownVi}
                              </span>
                              <div className="text-slate-500 dark:text-slate-400 space-y-0.5 text-[11px]">
                                <div>Số hiệu: {doc?.number || COPY.unknownVi}</div>
                                <div>
                                  {COPY.effectiveFromVi}: {formatDateVi(doc?.effective_date)}
                                </div>
                                <div>Cơ quan ban hành: {doc?.authority || COPY.unknownVi}</div>
                                <div>
                                  Trang tài liệu căn cứ:{' '}
                                  {props.source_page ? `Trang ${props.source_page}` : COPY.unknownVi}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Official URL link */}
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                            {officialUrl ? (
                              <a
                                href={officialUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline font-medium text-xs min-h-[36px]"
                              >
                                <span>{COPY.viewSourceVi}</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : (
                              <span className="text-slate-600 italic text-[11px]">
                                {COPY.noOfficialLinkVi}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Action Buttons: Share, Save, Report */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleShare}
                  className="h-12 flex flex-col items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors text-xs font-medium cursor-pointer"
                >
                  <Share2 className="w-4 h-4 mb-0.5" />
                  <span>Chia sẻ</span>
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  className="h-12 flex flex-col items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors text-xs font-medium cursor-pointer"
                >
                  <Bookmark className="w-4 h-4 mb-0.5" />
                  <span>Lưu vị trí</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenReport}
                  className="h-12 flex flex-col items-center justify-center rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 transition-colors text-xs font-medium cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4 mb-0.5 text-rose-500" />
                  <span>Báo sai</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
