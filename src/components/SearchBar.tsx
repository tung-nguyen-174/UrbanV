import React, { useState } from 'react';
import { Search, Loader2, X, MapPin } from 'lucide-react';
import { COPY } from '../taxonomy';

interface SearchBarProps {
  wardBbox: [number, number, number, number] | null;
  onSelectCoordinate: (lng: number, lat: number, displayName?: string) => void;
  disabled?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  wardBbox,
  onSelectCoordinate,
  disabled = false,
}) => {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery || isLoading) return;

    setIsLoading(true);
    setSearchError(null);

    try {
      // Default bounding box for Thanh Hóa pilot area if ward bbox is not yet loaded
      // [minLng, minLat, maxLng, maxLat] -> Nominatim viewbox format: minLng,maxLat,maxLng,minLat or minLng,minLat,maxLng,maxLat
      // Nominatim accepts: viewbox=<left>,<top>,<right>,<bottom> i.e. <min_lon>,<max_lat>,<max_lon>,<min_lat>
      let left = 105.70;
      let top = 19.88;
      let right = 105.85;
      let bottom = 19.75;

      if (wardBbox) {
        left = wardBbox[0];
        bottom = wardBbox[1];
        right = wardBbox[2];
        top = wardBbox[3];
      }

      const viewboxStr = `${left},${top},${right},${bottom}`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        cleanQuery
      )}&countrycodes=vn&viewbox=${viewboxStr}&bounded=1&limit=5`;

      const res = await fetch(url, {
        headers: {
          'Accept-Language': 'vi,en',
        },
      });

      if (!res.ok) {
        throw new Error(`Lỗi tìm kiếm: ${res.status}`);
      }

      const results = await res.json();
      if (!Array.isArray(results) || results.length === 0) {
        setSearchError('Không tìm thấy địa điểm trong khu vực thí điểm.');
        return;
      }

      const best = results[0];
      const lng = parseFloat(best.lon);
      const lat = parseFloat(best.lat);

      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        onSelectCoordinate(lng, lat, best.display_name);
      } else {
        setSearchError('Tọa độ địa điểm không hợp lệ.');
      }
    } catch (err) {
      console.warn('Search query failed:', err);
      setSearchError('Không thể kết nối dịch vụ tìm kiếm địa chỉ.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full relative z-20">
      <form
        onSubmit={handleSearch}
        className="flex items-center gap-1.5 sm:gap-2 bg-white/95 dark:bg-[#0B101D]/90 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/80 dark:border-white/12 p-1 sm:p-1.5 transition-all focus-within:ring-2 focus-within:ring-teal-500/50"
      >
        <div className="pl-2 sm:pl-3 text-slate-400 dark:text-slate-500 shrink-0">
          <MapPin className="w-5 h-5 text-teal-600 dark:text-teal-400" />
        </div>

        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            if (searchError) setSearchError(null);
          }}
          placeholder="Tìm đường hoặc địa điểm trong Phường Hạc Thành"
          className="w-full min-w-0 flex-1 bg-transparent text-[13px] sm:text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none px-1.5 sm:px-2 py-2"
        />

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSearchError(null);
            }}
            aria-label="Xóa nội dung tìm kiếm"
            className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <button
          type="submit"
          disabled={isLoading || !query.trim() || disabled}
          aria-label="Tìm kiếm vị trí"
          className="h-10 sm:h-11 px-3 sm:px-4 shrink-0 flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Tìm</span>
            </>
          )}
        </button>
      </form>

      {/* Error or Search Notice */}
      {searchError && (
        <div className="mt-1.5 px-3 py-1.5 text-sm bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 rounded-lg border border-rose-200 dark:border-rose-900 flex items-center justify-between shadow-xs">
          <span>{searchError}</span>
          <button
            onClick={() => setSearchError(null)}
            className="ml-2 font-bold hover:underline"
          >
            ✕
          </button>
        </div>
      )}

      {/* Subtle attribution info / hint text */}
      <div className="px-3 pt-1.5 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
        <span>Nhấn Enter hoặc nút Tìm để tra cứu</span>
        <span>{COPY.osmAttributionVi}</span>
      </div>
    </div>
  );
};
