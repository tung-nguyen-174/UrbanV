import React, { useState } from 'react';
import { Layers, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { LEGEND_GROUPS, type LegendGroupId } from '../taxonomy';

interface LegendProps {
  /** Legend groups present in the loaded features, with polygon counts. */
  presentGroups: { id: LegendGroupId; count: number }[];
}

export const Legend: React.FC<LegendProps> = ({ presentGroups }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const groupsToShow = presentGroups.filter((g) => LEGEND_GROUPS[g.id]);

  return (
    <div className="bg-white/95 dark:bg-[#0B101D]/90 backdrop-blur-xl rounded-2xl border border-slate-200/90 dark:border-white/12 shadow-xl overflow-hidden transition-all max-w-[320px] text-xs">
      {/* Header bar toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2 font-medium">
          <Layers className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          <span>Chú giải loại đất quy hoạch</span>
          {groupsToShow.length > 0 && (
            <span className="text-[11px] text-slate-400">({groupsToShow.length})</span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {/* Expanded body */}
      {isExpanded && (
        <div className="p-3 pt-0 border-t border-slate-100 dark:border-slate-800 space-y-2 max-h-60 overflow-y-auto">
          {groupsToShow.length === 0 ? (
            <div className="py-2.5 text-center text-slate-500 dark:text-slate-400 text-sm font-medium">
              Chưa có lớp quy hoạch đã duyệt
            </div>
          ) : (
            <div className="space-y-1.5 pt-2">
              {groupsToShow.map(({ id, count }) => {
                const item = LEGEND_GROUPS[id];
                return (
                  <div
                    key={id}
                    className="flex items-start gap-2.5 py-1 px-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    {/* Swatch with color, outline and glyph */}
                    <div
                      className="w-6 h-6 rounded-md shrink-0 flex items-center justify-center text-xs font-bold shadow-2xs"
                      style={{
                        backgroundColor: item.color,
                        border: `1.5px solid ${item.outline}`,
                        color: '#000000',
                      }}
                    >
                      <span className="leading-none text-[11px]">{item.glyph}</span>
                    </div>

                    <div className="flex-1 min-w-0 flex items-baseline justify-between gap-2">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">
                        {item.nameVi}
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {count} vùng
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Colour groups can cover several codes (SPEC rule 11) */}
          {groupsToShow.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-start gap-1.5 text-sm text-slate-600 dark:text-slate-400">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
              <span>Một số nhóm màu gồm nhiều mã đất; chưa phân loại chi tiết.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
