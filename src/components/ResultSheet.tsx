import React, { useState } from 'react';
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
  MapPin,
  Calendar,
  Clock,
  Building,
} from 'lucide-react';
import {
  STATUS,
  COPY,
  featureTitleVi,
  getGroup,
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

interface ResultSheetProps {
  result: LookupResult | null;
  documents: DocumentRecord[];
  adminUnits: AdminUnit[];
  onOpenReport: () => void;
  onClose: () => void;
}

export type SnapState = 'collapsed' | 'half' | 'full';

export const ResultSheet: React.FC<ResultSheetProps> = ({
  result,
  documents,
  adminUnits,
  onOpenReport,
  onClose,
}) => {
  const [snap, setSnap] = useState<SnapState>('half');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-[#0B101D]/95 backdrop-blur-2xl border-t border-slate-200/90 dark:border-white/12 rounded-t-3xl shadow-2xl transition-all duration-300 ease-out flex flex-col ${heightClass}`}
    >
      {/* Toast alert */}
      {toastMessage && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900/90 dark:bg-slate-100/90 text-white dark:text-slate-900 text-xs font-medium rounded-full shadow-lg backdrop-blur-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & Drag/Snap controller */}
      <div
        className="w-full shrink-0 pt-2 pb-1.5 px-4 cursor-pointer select-none"
        onClick={() => {
          if (snap === 'collapsed') setSnap('half');
          else if (snap === 'half') setSnap('full');
          else setSnap('half');
        }}
      >
        {/* Grab bar */}
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />

        {/* Collapsed top row summary */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-3 min-w-0">
            {/* Status indicator badge (No pill box, intentional status circle) */}
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-base shadow-xs"
              style={{
                backgroundColor: statusInfo.color,
                border: `1.5px solid ${statusInfo.outline}`,
                color: statusInfo.id === 'caution' ? '#000000' : '#FFFFFF',
              }}
            >
              <span>{statusInfo.icon}</span>
            </div>

            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white truncate">
                {statusInfo.labelVi}
              </h2>
              <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                {primaryMatch ? (
                  <>
                    <GroupSwatch legendGroup={primaryMatch.properties.legend_group} />
                    <span className="truncate">{featureTitleVi(primaryMatch.properties)}</span>
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
                className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
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
                  className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
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
                  className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
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
                className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Thu nhỏ về nửa màn hình"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Content (visible in half and full) */}
      {snap !== 'collapsed' && (
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-5">
          {/* Plain Vietnamese sentence (Body text: 16px) */}
          <div className="space-y-1">
            <p className="text-base text-slate-800 dark:text-slate-100 leading-relaxed font-medium">
              {result.message}
            </p>
          </div>

          {/* Quick metadata grid */}
          {primaryMatch && (
            <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-3">
              <div className="space-y-1">
                <span className="text-sm text-slate-400">Phân loại đất</span>
                {result.matches.map((m, idx) => (
                  <MatchTitle
                    key={m.properties.id || idx}
                    props={m.properties}
                    className="text-base font-semibold text-slate-900 dark:text-white"
                  />
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-sm">
                <div>
                  <span className="text-slate-400 flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {COPY.effectiveFromVi}
                  </span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {primaryMatch.properties.effective_date || COPY.unknownVi}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {COPY.lastUpdatedVi}
                  </span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {primaryMatch.properties.last_checked || COPY.unknownVi}
                  </span>
                </div>
              </div>

              {primaryMatch.properties.version_label && (
                <div className="text-sm pt-1">
                  <span className="text-slate-400">Phiên bản quy hoạch: </span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {primaryMatch.properties.version_label}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Reasons / Evaluation factors */}
          {result.reasons && result.reasons.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Căn cứ đánh giá trạng thái
              </h3>
              <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                {result.reasons.map((r, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 mt-2 shrink-0" />
                    <span className="leading-snug">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Full detail view (All matches, Legal Documents, Administrative Predecessors) */}
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

                    return (
                      <div
                        key={props.id || mIdx}
                        className="bg-slate-50/80 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200/70 dark:border-slate-700 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[11px] font-mono text-slate-400 block">
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
                              <span className="text-[11px] text-slate-400 block">Diện tích tính toán</span>
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
                                {doc?.title || 'Chưa có thông tin tên văn bản'}
                              </span>
                              <div className="text-slate-500 dark:text-slate-400 space-y-0.5 text-[11px]">
                                <div>Số hiệu: {doc?.number || COPY.unknownVi}</div>
                                <div>
                                  {COPY.effectiveFromVi}: {doc?.effective_date || COPY.unknownVi}
                                </div>
                                <div>Cơ quan ban hành: {doc?.authority || COPY.unknownVi}</div>
                                <div>
                                  Trang tài liệu căn cứ:{' '}
                                  {props.source_page ? `Trang ${props.source_page}` : COPY.unknownVi}
                                </div>
                              </div>
                              {!isDocumentVerified(doc) && (
                                <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
                                  {COPY.mapSourceNoteVi}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Official URL link */}
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                            {doc?.official_url ? (
                              <a
                                href={doc.official_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline font-medium text-xs min-h-[36px]"
                              >
                                <span>{COPY.viewSourceVi}</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">
                                {COPY.noOfficialLinkVi}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Transitional note */}
                        {props.transitional && (
                          <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900">
                            <strong>Lưu ý:</strong> {COPY.transitionalVi}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Administrative hierarchy & Predecessors */}
              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs space-y-2">
                <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-medium">
                  <Building className="w-4 h-4 text-slate-500" />
                  <span>Đơn vị hành chính: Tỉnh Thanh Hóa › Phường Hạc Thành</span>
                </div>
                {hacThanhAdmin && hacThanhAdmin.predecessors?.length > 0 && (
                  <div className="text-slate-500 dark:text-slate-400 leading-relaxed text-[11px] pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                      Tên cũ / sáp nhập:{' '}
                    </span>
                    <span>
                      Hợp nhất từ {hacThanhAdmin.predecessors.join(', ')} (theo Đề án sắp xếp ĐVHC có hiệu lực từ 01/07/2025).
                    </span>
                  </div>
                )}
              </div>

              {/* Legal Disclaimer */}
              <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 rounded-xl border border-amber-200/60 dark:border-amber-900/60 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <p className="leading-snug">{COPY.disclaimerVi}</p>
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
    </div>
  );
};
