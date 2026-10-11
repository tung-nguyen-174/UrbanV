import React, { useEffect, useId, useState } from 'react';
import { X, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { COPY } from '../taxonomy';
import type { PlanningFeature } from '../types';

const MAX_MESSAGE_LENGTH = 1000;
/** One report per 30 seconds per page session (client-side only). */
export const REPORT_COOLDOWN_MS = 30_000;
let lastReportSentAt = 0;

/** Netlify Forms only receive posts on the deployed site, not on localhost or the Vite dev server. */
export function isLocalDevHost(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}

interface ReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lng: number;
  lat: number;
  matches: PlanningFeature[];
}

export const ReportDialog: React.FC<ReportDialogProps> = ({
  isOpen,
  onClose,
  lng,
  lat,
  matches,
}) => {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const titleId = useId();
  const messageId = useId();

  // Count down the 30-second cooldown while the dialog is open
  useEffect(() => {
    if (!isOpen) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((lastReportSentAt + REPORT_COOLDOWN_MS - Date.now()) / 1000));
      setCooldownLeft(left);
    };
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [isOpen, isSuccess]);

  // Escape closes the dialog
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const featureIds = matches.map((m) => m.properties.id || 'unknown').join(', ');
  const localOnly = isLocalDevHost();
  const trimmed = message.trim();
  const canSubmit = !localOnly && !isSubmitting && trimmed.length > 0 && cooldownLeft === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setErrorNotice(null);

    // Only the fields listed in SPEC: no name, no email. 'bot-field' is the honeypot and stays empty.
    const body = new URLSearchParams({
      'form-name': 'report-error',
      'bot-field': '',
      message: trimmed,
      lng: lng.toFixed(6),
      lat: lat.toFixed(6),
      feature_ids: featureIds,
      page_url: `${window.location.origin}${window.location.pathname}`,
    });

    try {
      const response = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      lastReportSentAt = Date.now();
      setMessage('');
      setIsSuccess(true);
    } catch (err) {
      console.warn('Report not sent:', err);
      // Keep the typed text so the user can retry
      setErrorNotice('Chưa gửi được báo cáo. Kiểm tra kết nối rồi thử lại. Nội dung bạn đã nhập vẫn còn đó.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsSuccess(false);
    setErrorNotice(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg bg-white dark:bg-[#0B101D] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/12 overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <h3 id={titleId} className="text-base font-semibold text-slate-900 dark:text-white">
              {COPY.reportButtonVi}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Đóng"
            className="w-12 h-12 flex items-center justify-center rounded-full text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isSuccess ? (
            <div className="py-6 text-center space-y-3" role="status">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
              </div>
              <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                Cảm ơn phản hồi của bạn!
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-sm mx-auto">
                Thông tin báo sai đã được tiếp nhận để đội ngũ đối chiếu lại với hồ sơ bản đồ gốc của Phường Hạc Thành.
              </p>
              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full h-12 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium text-sm transition-colors hover:bg-slate-800"
                >
                  Đóng
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {localOnly && (
                <p role="note" className="p-3 rounded-xl text-sm bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900">
                  Gửi báo lỗi chỉ hoạt động trên Netlify.
                </p>
              )}

              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl text-xs space-y-1 text-slate-600 dark:text-slate-300">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-400">Tọa độ kiểm tra:</span>
                  <span className="font-mono font-medium">{lng.toFixed(5)}, {lat.toFixed(5)}</span>
                </div>
                {featureIds && (
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-600 dark:text-slate-400">Mã vùng liên quan:</span>
                    <span className="font-mono font-medium truncate max-w-[200px]">{featureIds}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor={messageId} className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                  Mô tả nội dung chưa chính xác
                </label>
                <textarea
                  id={messageId}
                  required
                  maxLength={MAX_MESSAGE_LENGTH}
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ví dụ: Ranh giới đường quy hoạch lệch so với thực tế, loại đất chưa cập nhật theo quyết định mới..."
                  className="w-full p-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-400 transition-all resize-none"
                />
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span>Không nhập thông tin cá nhân.</span>
                  <span className="tabular-nums">{message.length}/{MAX_MESSAGE_LENGTH}</span>
                </div>
              </div>

              {cooldownLeft > 0 && (
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  Bạn vừa gửi một báo cáo. Có thể gửi thêm sau {cooldownLeft} giây.
                </p>
              )}

              {errorNotice && (
                <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{errorNotice}</p>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="min-h-[48px] px-4 text-sm font-medium text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="min-h-[48px] flex items-center gap-2 px-5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium text-sm transition-opacity disabled:opacity-50 hover:bg-slate-800 dark:hover:bg-slate-200 cursor-pointer"
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                  <span>{isSubmitting ? 'Đang gửi...' : 'Gửi báo cáo'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
