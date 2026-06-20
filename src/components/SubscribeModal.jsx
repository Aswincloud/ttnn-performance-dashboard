import React, { useEffect, useState } from 'react';
import { X, Bell, TrendingDown, TrendingUp, Loader2, CheckCircle2 } from 'lucide-react';

// Self-service signup for per-operation performance alerts. Posts to the
// Worker's /api/subscribe route, which creates an unconfirmed subscriber and
// emails a confirmation link (double opt-in). Mirrors CatalogModal's shell:
// overlay click-to-close + inner stopPropagation + Escape handler + glass-card.
const SubscribeModal = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [improvePct, setImprovePct] = useState('');
  const [degradePct, setDegradePct] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset transient state whenever the modal is opened fresh.
  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
      setMessage('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('submitting');
    setMessage('');

    const payload = { email: email.trim() };
    if (improvePct !== '') payload.improve_pct = Number(improvePct);
    if (degradePct !== '') payload.degrade_pct = Number(degradePct);

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('success');
        setMessage(data.message || 'Check your email to confirm your subscription.');
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm h-10';

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="glass-card max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-200">
          <div className="flex items-center">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-600 rounded-xl blur-lg opacity-30"></div>
              <div className="relative bg-gradient-to-br from-blue-500 to-indigo-600 p-3 rounded-xl">
                <Bell className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="ml-4">
              <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Performance Alerts
              </h2>
              <p className="text-sm text-gray-600">Get emailed when ops cross your thresholds</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            aria-label="Close"
          >
            <X className="h-6 w-6 text-gray-500" />
          </button>
        </div>

        {status === 'success' ? (
          <div className="text-center py-6">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-gray-800 font-medium">{message}</p>
            <button onClick={onClose} className="btn-secondary mt-5 inline-flex">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="alert-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="alert-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="improve-pct" className="block text-sm font-medium text-gray-700 mb-1">
                  <TrendingUp className="inline h-4 w-4 text-green-600 mr-1" />
                  Improvement %
                </label>
                <input
                  id="improve-pct"
                  type="number"
                  min="0"
                  step="0.5"
                  value={improvePct}
                  onChange={(e) => setImprovePct(e.target.value)}
                  placeholder="e.g. 10"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="degrade-pct" className="block text-sm font-medium text-gray-700 mb-1">
                  <TrendingDown className="inline h-4 w-4 text-red-600 mr-1" />
                  Degradation %
                </label>
                <input
                  id="degrade-pct"
                  type="number"
                  min="0"
                  step="0.5"
                  value={degradePct}
                  onChange={(e) => setDegradePct(e.target.value)}
                  placeholder="e.g. 10"
                  className={inputClass}
                />
              </div>
            </div>

            <p className="text-xs text-gray-500">
              Set either or both. You&apos;ll be alerted when any operation gets faster by your
              improvement % or slower by your degradation %, compared to the previous day. A
              confirmation email is sent first — you only get alerts after you confirm.
            </p>

            {status === 'error' && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'submitting'}
              className="btn-primary w-full inline-flex items-center justify-center disabled:opacity-60"
            >
              {status === 'submitting' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Subscribing…
                </>
              ) : (
                'Subscribe to alerts'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default SubscribeModal;
