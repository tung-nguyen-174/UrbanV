import React, { useRef, useState } from 'react';
import { Search, Loader2, X, MapPin } from 'lucide-react';

export interface PlaceResult {
  lng: number;
  lat: number;
  label: string;
}

export type SearchOutcome =
  | { kind: 'results'; results: PlaceResult[] }
  | { kind: 'empty' }
  | { kind: 'offline' }
  | { kind: 'error' }
  | { kind: 'ignored' }
  | { kind: 'busy' };

/** Messages for each failure outcome (Vietnamese, plain). */
export const SEARCH_MESSAGES = {
  empty: 'Không tìm thấy trong Phường Hạc Thành. Thử tên đường hoặc địa điểm khác.',
  offline: 'Không có kết nối. Dữ liệu quy hoạch đã tải vẫn dùng được.',
  error: 'Không thể tìm kiếm lúc này. Thử lại sau ít phút.',
} as const;

export const NOMINATIM_MIN_INTERVAL_MS = 1000;
const MAX_RESULTS = 5;

export interface PlaceSearchDeps {
  fetchFn?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Nominatim search limited to the ward bounding box. One request at a time, and at
 * most one request per second. Calls made while a request is running return 'busy'.
 * `bbox` is [minLng, minLat, maxLng, maxLat].
 */
export function createPlaceSearch(deps: PlaceSearchDeps = {}) {
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let inFlight = false;
  let lastStartedAt = -Infinity;

  return async function search(
    rawQuery: string,
    bbox: [number, number, number, number] | null
  ): Promise<SearchOutcome> {
    const query = rawQuery.trim();
    if (!query) return { kind: 'ignored' };
    if (inFlight) return { kind: 'busy' };
    inFlight = true;
    try {
      const wait = NOMINATIM_MIN_INTERVAL_MS - (now() - lastStartedAt);
      if (wait > 0) await sleep(wait);
      lastStartedAt = now();

      // Nominatim viewbox order: left (min lon), top (max lat), right (max lon), bottom (min lat)
      // Fallback box covers Thanh Hóa city when the ward boundary has not loaded.
      const [left, bottom, right, top] = bbox ?? [105.7, 19.75, 105.85, 19.88];
      const params = new URLSearchParams({
        format: 'json',
        q: query,
        countrycodes: 'vn',
        viewbox: `${left},${top},${right},${bottom}`,
        bounded: '1',
        limit: String(MAX_RESULTS),
        'accept-language': 'vi',
      });

      let res: Response;
      try {
        res = await fetchFn(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
      } catch {
        // fetch rejects with a TypeError when there is no network
        return { kind: 'offline' };
      }
      if (!res.ok) return { kind: 'error' };

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        return { kind: 'error' };
      }
      if (!Array.isArray(data)) return { kind: 'error' };

      const results: PlaceResult[] = [];
      for (const item of data as Array<{ lon?: string; lat?: string; display_name?: string }>) {
        const lng = parseFloat(item.lon ?? '');
        const lat = parseFloat(item.lat ?? '');
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          results.push({ lng, lat, label: item.display_name ?? '' });
        }
      }
      return results.length ? { kind: 'results', results: results.slice(0, MAX_RESULTS) } : { kind: 'empty' };
    } finally {
      inFlight = false;
    }
  };
}

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
  const [choices, setChoices] = useState<PlaceResult[] | null>(null);
  const clientRef = useRef(createPlaceSearch());

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLoading || disabled) return;

    setIsLoading(true);
    setSearchError(null);
    setChoices(null);
    try {
      const outcome = await clientRef.current(query, wardBbox);
      if (outcome.kind === 'ignored' || outcome.kind === 'busy') return;
      if (outcome.kind === 'results') {
        if (outcome.results.length === 1) {
          const only = outcome.results[0];
          onSelectCoordinate(only.lng, only.lat, only.label);
        } else {
          setChoices(outcome.results);
        }
        return;
      }
      if (outcome.kind === 'empty') setSearchError(SEARCH_MESSAGES.empty);
      else if (outcome.kind === 'offline') setSearchError(SEARCH_MESSAGES.offline);
      else setSearchError(SEARCH_MESSAGES.error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full relative z-20">
      <div className="bg-white/95 dark:bg-[#0B101D]/90 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/80 dark:border-white/12 transition-all focus-within:ring-2 focus-within:ring-teal-500/50">
      <form
        onSubmit={handleSearch}
        aria-busy={isLoading}
        className="flex items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5"
      >
        <div className="pl-2 sm:pl-3 text-slate-600 dark:text-slate-500 shrink-0">
          <MapPin className="w-5 h-5 text-teal-600 dark:text-teal-400" />
        </div>

        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            if (searchError) setSearchError(null);
            if (choices) setChoices(null);
          }}
          placeholder="Tìm đường hoặc địa điểm"
          aria-label="Tìm đường hoặc địa điểm"
          className="w-full min-w-0 flex-1 bg-transparent text-[13px] sm:text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none px-1.5 sm:px-2 py-2"
        />

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSearchError(null);
              setChoices(null);
            }}
            aria-label="Xóa nội dung tìm kiếm"
            className="w-12 h-12 shrink-0 flex items-center justify-center rounded-xl text-slate-600 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <button
          type="submit"
          disabled={isLoading || !query.trim() || disabled}
          aria-label="Tìm kiếm vị trí"
          className="h-12 px-3 sm:px-4 shrink-0 flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
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
      {/* Label under the input and the hint, both inside the search card */}
      <div className="px-3 pb-2 space-y-0.5 text-sm">
        <p className="font-medium text-slate-900 dark:text-white">Trong Phường Hạc Thành</p>
        <p className="text-slate-700 dark:text-slate-300">Nhấn Enter hoặc nút Tìm để tra cứu</p>
      </div>
      </div>

      {isLoading && (
        <div role="status" className="mt-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300">
          Đang tìm…
        </div>
      )}

      {/* Several matches: short list to choose from */}
      {choices && (
        <ul className="mt-1.5 bg-white/95 dark:bg-[#0B101D]/90 rounded-xl border border-slate-200/80 dark:border-white/12 shadow-xs divide-y divide-slate-100 dark:divide-white/10 overflow-hidden">
          {choices.map((c, i) => (
            <li key={`${c.lng},${c.lat},${i}`}>
              <button
                type="button"
                onClick={() => {
                  setChoices(null);
                  onSelectCoordinate(c.lng, c.lat, c.label);
                }}
                className="w-full min-h-[48px] px-3 py-2 text-left text-sm text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/5"
              >
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Error or Search Notice */}
      {searchError && (
        <div
          role="alert"
          className="mt-1.5 px-3 py-1.5 text-sm bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 rounded-lg border border-rose-200 dark:border-rose-900 flex items-center justify-between shadow-xs"
        >
          <span>{searchError}</span>
          <button
            type="button"
            onClick={() => setSearchError(null)}
            aria-label="Đóng thông báo"
            className="ml-2 min-h-[48px] min-w-[48px] font-bold hover:underline"
          >
            ✕
          </button>
        </div>
      )}

    </div>
  );
};
