import React, { useEffect, useState, useCallback } from 'react';
import { X, Users, Loader2, RefreshCw } from 'lucide-react';

// Read-only subscriber list for the operator. Only mounted/triggered when the
// dashboard detects it's being viewed from the home IP (App pings
// /api/admin/context). The data endpoint is gated on the same home-IP check, so
// no key is required — being on the home network is the access.
const AdminSubscribersModal = ({ isOpen, onClose }) => {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ok | error
  const [message, setMessage] = useState('');

  const fetchSubscribers = useCallback(async () => {
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/admin/subscribers');
      if (res.status === 403) {
        setStatus('error');
        setMessage('This view is only available from the home network.');
        return;
      }
      if (!res.ok) {
        setStatus('error');
        setMessage(`Request failed (${res.status}).`);
        return;
      }
      setData(await res.json());
      setStatus('ok');
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  }, []);

  // Escape to close.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Fetch when opened.
  useEffect(() => {
    if (isOpen) fetchSubscribers();
  }, [isOpen, fetchSubscribers]);

  if (!isOpen) return null;

  const fmtPct = (v) => (v == null ? '—' : `${v}%`);
  const fmtDate = (s) => (s ? s.slice(0, 10) : '—');

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="glass-card max-w-3xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-600 rounded-xl blur-lg opacity-30"></div>
              <div className="relative bg-gradient-to-br from-blue-500 to-indigo-600 p-3 rounded-xl">
                <Users className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="ml-4">
              <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Alert Subscribers
              </h2>
              <p className="text-sm text-gray-600">
                {status === 'ok' && data
                  ? `${data.confirmed} confirmed · ${data.pending} pending`
                  : 'Admin view'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {status === 'ok' && (
              <button
                onClick={fetchSubscribers}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Refresh"
                title="Refresh"
              >
                <RefreshCw className="h-5 w-5 text-gray-500" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="h-6 w-6 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Body */}
        {status === 'loading' ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading subscribers…
          </div>
        ) : status === 'error' ? (
          <div className="text-center py-10">
            <p className="text-gray-700">{message}</p>
            <button onClick={fetchSubscribers} className="btn-secondary mt-4">
              Retry
            </button>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 -mx-2">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-gray-500 border-b border-gray-200 sticky top-0 bg-white/90 backdrop-blur">
                <tr>
                  <th className="text-left font-semibold py-2 px-2">Email</th>
                  <th className="text-center font-semibold py-2 px-2">Improve</th>
                  <th className="text-center font-semibold py-2 px-2">Degrade</th>
                  <th className="text-center font-semibold py-2 px-2">Status</th>
                  <th className="text-right font-semibold py-2 px-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {data?.subscribers?.length ? (
                  data.subscribers.map((s) => (
                    <tr key={s.email} className="border-b border-gray-100 hover:bg-blue-50/40">
                      <td className="py-2 px-2 font-mono text-gray-800">{s.email}</td>
                      <td className="py-2 px-2 text-center text-green-700">{fmtPct(s.improve_pct)}</td>
                      <td className="py-2 px-2 text-center text-red-700">{fmtPct(s.degrade_pct)}</td>
                      <td className="py-2 px-2 text-center">
                        {s.confirmed === 1 ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Confirmed
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right text-gray-500">{fmtDate(s.created_at)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center text-gray-400 py-10">
                      No subscribers yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {status === 'ok' && (
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-gray-200 text-xs text-gray-500 flex-shrink-0">
            <span>{data?.total ?? 0} total</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSubscribersModal;
