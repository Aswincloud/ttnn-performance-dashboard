import React, { useEffect, useState, useCallback } from 'react';
import { X, Users, Loader2, RefreshCw, Pencil, Trash2, Check, Ban } from 'lucide-react';

// Read-only subscriber list + admin edit/delete for the operator. The list is
// gated on the home IP (App pings /api/admin/context). Mutating actions
// additionally require a password, held in memory only for the session (it's a
// credential — never written to localStorage).
const AdminSubscribersModal = ({ isOpen, onClose }) => {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ok | error
  const [message, setMessage] = useState('');

  const [password, setPassword] = useState(''); // in-memory only
  const [pendingAction, setPendingAction] = useState(null); // queued op awaiting password
  const [editing, setEditing] = useState(null); // email being edited
  const [editVals, setEditVals] = useState({ improve_pct: '', degrade_pct: '' });
  const [confirmDelete, setConfirmDelete] = useState(null); // email pending delete confirm
  const [actionError, setActionError] = useState('');

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

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) fetchSubscribers();
  }, [isOpen, fetchSubscribers]);

  // Reset transient edit/password UI whenever the modal reopens.
  useEffect(() => {
    if (isOpen) {
      setEditing(null);
      setConfirmDelete(null);
      setPendingAction(null);
      setActionError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Run a write (delete/update) with the given password. On 401, surface a
  // password prompt and remember the action to retry once a password is given.
  const runWrite = async (action, pw) => {
    setActionError('');
    try {
      const res = await fetch(action.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...action.payload, password: pw }),
      });
      if (res.status === 401) {
        setPassword('');
        setPendingAction(action);
        setActionError('Incorrect password. Try again.');
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(body.error || `Action failed (${res.status}).`);
        return;
      }
      // Success — clear edit/confirm state and refresh.
      setEditing(null);
      setConfirmDelete(null);
      setPendingAction(null);
      await fetchSubscribers();
    } catch {
      setActionError('Network error. Please try again.');
    }
  };

  // Entry point for any write: if we already hold a password use it, else queue
  // the action and prompt.
  const requestWrite = (action) => {
    if (password) runWrite(action, password);
    else {
      setPendingAction(action);
      setActionError('');
    }
  };

  const submitPassword = (e) => {
    e.preventDefault();
    const pw = e.target.elements.pw.value;
    if (!pw) return;
    setPassword(pw);
    const action = pendingAction;
    setPendingAction(null);
    if (action) runWrite(action, pw);
  };

  const startEdit = (s) => {
    setConfirmDelete(null);
    setActionError('');
    setEditing(s.email);
    setEditVals({
      improve_pct: s.improve_pct ?? '',
      degrade_pct: s.degrade_pct ?? '',
    });
  };

  const saveEdit = (email) => {
    const payload = {
      email,
      improve_pct: editVals.improve_pct === '' ? null : Number(editVals.improve_pct),
      degrade_pct: editVals.degrade_pct === '' ? null : Number(editVals.degrade_pct),
    };
    requestWrite({ url: '/api/admin/subscribers/update', payload });
  };

  const doDelete = (email) =>
    requestWrite({ url: '/api/admin/subscribers/delete', payload: { email } });

  const fmtPct = (v) => (v == null ? '—' : `${v}%`);
  const fmtDate = (s) => (s ? s.slice(0, 10) : '—');
  const inputCls =
    'w-16 px-1.5 py-0.5 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 rounded text-sm text-center focus:ring-1 focus:ring-blue-500';

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
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
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
              <p className="text-sm text-gray-600 dark:text-gray-400">
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
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                aria-label="Refresh"
                title="Refresh"
              >
                <RefreshCw className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="h-6 w-6 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Password prompt (shown when a write needs one) */}
        {pendingAction && (
          <form onSubmit={submitPassword} className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <label className="block text-sm font-medium text-amber-900 mb-2">
              Enter admin password to confirm this change
            </label>
            <div className="flex gap-2">
              <input
                name="pw"
                type="password"
                autoFocus
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded-lg text-sm h-9 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Password"
              />
              <button type="submit" className="btn-primary px-4 text-sm">Confirm</button>
              <button
                type="button"
                onClick={() => { setPendingAction(null); setActionError(''); }}
                className="btn-secondary px-3 text-sm"
              >
                Cancel
              </button>
            </div>
            {actionError && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{actionError}</p>}
          </form>
        )}
        {actionError && !pendingAction && (
          <p className="text-sm text-red-600 dark:text-red-400 mb-3">{actionError}</p>
        )}

        {/* Body */}
        {status === 'loading' ? (
          <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading subscribers…
          </div>
        ) : status === 'error' ? (
          <div className="text-center py-10">
            <p className="text-gray-700 dark:text-gray-300">{message}</p>
            <button onClick={fetchSubscribers} className="btn-secondary mt-4">
              Retry
            </button>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 -mx-2">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-slate-700 sticky top-0 bg-white/90 dark:bg-slate-800/90 backdrop-blur">
                <tr>
                  <th className="text-left font-semibold py-2 px-2">Email</th>
                  <th className="text-center font-semibold py-2 px-2">Improve</th>
                  <th className="text-center font-semibold py-2 px-2">Degrade</th>
                  <th className="text-center font-semibold py-2 px-2">Status</th>
                  <th className="text-right font-semibold py-2 px-2">Joined</th>
                  <th className="text-right font-semibold py-2 px-2 w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.subscribers?.length ? (
                  data.subscribers.map((s) => {
                    const isEditing = editing === s.email;
                    const isConfirming = confirmDelete === s.email;
                    return (
                      <tr key={s.email} className="border-b border-gray-100 dark:border-slate-700/60 hover:bg-blue-50/40 dark:hover:bg-slate-700/40">
                        <td className="py-2 px-2 font-mono text-gray-800 dark:text-gray-100">{s.email}</td>
                        <td className="py-2 px-2 text-center text-green-700 dark:text-green-400">
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={editVals.improve_pct}
                              onChange={(e) => setEditVals((v) => ({ ...v, improve_pct: e.target.value }))}
                              className={inputCls}
                              placeholder="—"
                            />
                          ) : (
                            fmtPct(s.improve_pct)
                          )}
                        </td>
                        <td className="py-2 px-2 text-center text-red-700 dark:text-red-400">
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={editVals.degrade_pct}
                              onChange={(e) => setEditVals((v) => ({ ...v, degrade_pct: e.target.value }))}
                              className={inputCls}
                              placeholder="—"
                            />
                          ) : (
                            fmtPct(s.degrade_pct)
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {s.confirmed === 1 ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200">
                              Confirmed
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right text-gray-500 dark:text-gray-400">{fmtDate(s.created_at)}</td>
                        <td className="py-2 px-2">
                          <div className="flex items-center justify-end gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => saveEdit(s.email)}
                                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                                  title="Save"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => setEditing(null)}
                                  className="p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
                                  title="Cancel"
                                >
                                  <Ban className="h-4 w-4" />
                                </button>
                              </>
                            ) : isConfirming ? (
                              <>
                                <button
                                  onClick={() => doDelete(s.email)}
                                  className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                  title="Confirm delete"
                                >
                                  Delete
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  className="p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
                                  title="Cancel"
                                >
                                  <Ban className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEdit(s)}
                                  className="p-1 text-gray-500 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-600 rounded"
                                  title="Edit thresholds"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => { setEditing(null); setActionError(''); setConfirmDelete(s.email); }}
                                  className="p-1 text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/40 hover:text-red-600 rounded"
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center text-gray-400 dark:text-gray-500 py-10">
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
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-gray-200 dark:border-slate-700 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
            <span>{data?.total ?? 0} total</span>
            {password && (
              <button onClick={() => setPassword('')} className="hover:text-gray-800 dark:hover:text-gray-200">
                Forget password
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSubscribersModal;
