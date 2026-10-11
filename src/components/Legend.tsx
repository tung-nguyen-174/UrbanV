import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Info, Layers } from 'lucide-react';
import { LEGEND_GROUPS, type LegendGroupId } from '../taxonomy';

/** The note that explains colour groups (SPEC rule 11). Shown in the info popover. */
const GROUP_NOTE = 'Một số nhóm màu gồm nhiều mã đất; chưa phân loại chi tiết.';

export interface LegendItem {
  id: LegendGroupId;
  /** Share of the ward's area covered by this group, in percent. */
  /** Share of the ward, in percent; null while the share file has not loaded. */
  areaPct: number | null;
}

interface LegendChipsProps {
  /** Groups present in the loaded features, in legend order. */
  items: LegendItem[];
  /** Groups currently shown on the map. */
  activeGroups: LegendGroupId[];
  onToggle: (id: LegendGroupId) => void;
  /** Preview mode: the percentages come from draft data. */
  previewDraft: boolean;
}

/** Horizontally scrollable row of toggle chips, one per legend group present. */
export const LegendChips: React.FC<LegendChipsProps> = ({
  items,
  activeGroups,
  onToggle,
  previewDraft,
}) => {
  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <div className="space-y-1">
      {previewDraft && items.length > 0 && (
        <p className="px-1 text-sm font-medium text-red-700 dark:text-red-300">Tạm tính từ bản nháp</p>
      )}

      <div className="flex items-stretch gap-2">
        {items.length === 0 ? (
          <p className="flex-1 px-3 py-3 rounded-xl bg-white/95 dark:bg-[#0B101D]/90 text-sm font-medium text-slate-700 dark:text-slate-300 shadow-xs">
            Chưa có lớp quy hoạch đã duyệt
          </p>
        ) : (
          <div
            role="group"
            aria-label="Lọc theo nhóm màu"
            className="flex-1 min-w-0 flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 scroll-pl-1"
          >
            {items.map(({ id, areaPct }) => {
              const group = LEGEND_GROUPS[id];
              const pressed = activeGroups.includes(id);
              const pct = areaPct === null ? '' : areaPct < 1 ? '<1%' : `~${Math.round(areaPct)}%`;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => onToggle(id)}
                  className={`snap-start shrink-0 min-h-[48px] flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left shadow-xs transition-colors cursor-pointer ${
                    pressed
                      ? 'bg-white/95 dark:bg-[#0B101D]/90 border-slate-300 dark:border-white/20'
                      : 'bg-slate-100 dark:bg-slate-800 border-dashed border-slate-400 dark:border-slate-500'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-7 h-7 rounded-md shrink-0 flex items-center justify-center text-[13px] leading-none text-black ${
                      pressed ? '' : 'opacity-40'
                    }`}
                    style={{ backgroundColor: group.color, border: `1.5px solid ${group.outline}` }}
                  >
                    {group.glyph}
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span
                      className={`text-sm font-medium truncate max-w-[9.5rem] ${
                        pressed ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {group.nameVi}
                    </span>
                    <span className="text-sm text-slate-700 dark:text-slate-300 tabular-nums">
                      {pct}
                      {!pressed && ' · ẩn'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Info popover with the colour-group note */}
        <button
          type="button"
          aria-expanded={noteOpen}
          aria-label="Ghi chú về nhóm màu"
          onClick={() => setNoteOpen((v) => !v)}
          className="w-12 h-12 shrink-0 self-center rounded-xl bg-white/95 dark:bg-[#0B101D]/90 border border-slate-200/80 dark:border-white/12 shadow-xs flex items-center justify-center text-slate-700 dark:text-slate-200 cursor-pointer"
        >
          <Info className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      {noteOpen && (
        <p
          role="note"
          className="px-3 py-2 rounded-xl text-sm bg-white dark:bg-[#0B101D] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/12 shadow-lg"
        >
          {GROUP_NOTE}
        </p>
      )}
    </div>
  );
};

interface LayerControlsProps {
  fillOpacity: number;
  onOpacityChange: (value: number) => void;
  showPatterns: boolean;
  onPatternsChange: (value: boolean) => void;
}

/** Collapsible panel: fill opacity slider and pattern toggle. */
export const LayerControls: React.FC<LayerControlsProps> = ({
  fillOpacity,
  onOpacityChange,
  showPatterns,
  onPatternsChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-56 bg-white/95 dark:bg-[#0B101D]/90 backdrop-blur-xl rounded-2xl border border-slate-200/90 dark:border-white/12 shadow-xl overflow-hidden">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        className="w-full min-h-[48px] px-3 flex items-center justify-between gap-2 text-sm font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <Layers className="w-4 h-4" aria-hidden="true" />
          Hiển thị
        </span>
        {isOpen ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-slate-100 dark:border-slate-800">
          <div className="space-y-1">
            <label htmlFor="fill-opacity-range" className="flex items-center justify-between text-sm font-medium text-slate-800 dark:text-slate-200">
              <span>Độ mờ</span>
              <span className="tabular-nums">{Math.round(fillOpacity * 100)}%</span>
            </label>
            <input
              id="fill-opacity-range"
              type="range"
              min={0.1}
              max={0.8}
              step={0.05}
              value={fillOpacity}
              onChange={(e) => onOpacityChange(Number(e.target.value))}
              aria-valuetext={`${Math.round(fillOpacity * 100)}%`}
              className="w-full h-6 accent-slate-900 dark:accent-teal-400 cursor-pointer"
            />
          </div>

          <button
            type="button"
            aria-pressed={showPatterns}
            onClick={() => onPatternsChange(!showPatterns)}
            className="w-full min-h-[48px] px-3 rounded-xl border border-slate-200 dark:border-white/12 text-sm font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 cursor-pointer"
          >
            Hoa văn: {showPatterns ? 'bật' : 'tắt'}
          </button>
        </div>
      )}
    </div>
  );
};
