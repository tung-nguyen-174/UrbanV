import React, { useState } from 'react';
import { Layers, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { LAND_USE, type LandUseCode } from '../taxonomy';

interface LegendProps {
  presentCodes: LandUseCode[];
}

export const Legend: React.FC<LegendProps> = ({ presentCodes }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // If no features loaded yet, show minimal or empty
  const codesToShow = presentCodes.filter((code) => LAND_USE[code]);

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
          {codesToShow.length > 0 && (
            <span className="text-[11px] text-slate-400">({codesToShow.length})</span>
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
          {codesToShow.length === 0 ? (
            <div className="py-2.5 text-center text-slate-500 dark:text-slate-400 text-sm font-medium">
              Chưa có lớp quy hoạch đã duyệt
            </div>
          ) : (
            <div className="space-y-1.5 pt-2">
              {codesToShow.map((code) => {
                const item = LAND_USE[code];
                return (
                  <div
                    key={code}
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

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-semibold text-slate-900 dark:text-white font-mono text-[11px]">
                          {item.code}
                        </span>
                        <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                          {item.nameVi}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                        {item.plainVi}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Mandatory note from prompt & SPEC */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-start gap-1.5 text-sm text-slate-600 dark:text-slate-400">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
            <span>Chưa số hóa toàn bộ phường · Thông tư 08/2024/TT-BTNMT</span>
          </div>
        </div>
      )}
    </div>
  );
};
