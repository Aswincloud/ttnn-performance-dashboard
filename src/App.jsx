import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle, Zap, TrendingUp, Book, Github, Bug, GitPullRequest, Bell, Users, Sun, Moon, LayoutGrid, ExternalLink } from 'lucide-react';
import OverviewCards from './components/OverviewCards';
import PerformanceTable from './components/PerformanceTable';
import CatalogModal from './components/CatalogModal';
import SubscribeModal from './components/SubscribeModal';
import AdminSubscribersModal from './components/AdminSubscribersModal';
import {
  loadPerformanceMulti,
  processOperationData,
  calculateSummaryStats,
} from './utils/dataLoader';

// The four (hardware × shape) combos, in a FIXED order. This order drives the
// checkbox order and — since selected combos keep this order — the sub-row order
// under each op in the table, so the layout is stable regardless of click order.
const COMBOS = ['n150_small', 'n150_large', 'p100a_small', 'p100a_large'];
const COMBO_LABEL = {
  n150_small: 'N150 · 32²',
  n150_large: 'N150 · 1024²',
  p100a_small: 'P100a · 32²',
  p100a_large: 'P100a · 1024²',
};

// A labelled group of combo checkboxes: pick any subset of the 4 combos to show
// side-by-side (one sub-row per combo, per op). The last-checked box can't be
// unchecked — the table always has at least one combo to render.
function ComboCheckboxes({ selected, onChange }) {
  const toggle = (combo) => {
    const has = selected.includes(combo);
    if (has && selected.length === 1) return; // keep ≥1 selected
    // Re-derive from COMBOS so the result stays in the fixed order.
    const next = COMBOS.filter((c) => (c === combo ? !has : selected.includes(c)));
    onChange(next);
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span id="combo-group-label" className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">
        Compare
      </span>
      <div
        role="group"
        aria-labelledby="combo-group-label"
        className="inline-flex flex-wrap gap-1"
      >
        {COMBOS.map((combo) => {
          const on = selected.includes(combo);
          const lockedOn = on && selected.length === 1; // the last one — can't turn off
          return (
            <label
              key={combo}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md ring-1 transition-colors select-none ${
                lockedOn ? 'cursor-default' : 'cursor-pointer'
              } ${
                on
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 ring-blue-300 dark:ring-blue-500/50 shadow-sm'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 ring-gray-200 dark:ring-slate-700 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
              title={lockedOn ? 'At least one combo must stay selected' : undefined}
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={on}
                disabled={lockedOn}
                onChange={() => toggle(combo)}
              />
              {COMBO_LABEL[combo]}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// Persisted MULTI-select: a validated, non-empty subset of `allowed`, stored as
// a JSON array in localStorage. Values not in `allowed` are dropped; an empty or
// unparseable result falls back to `fallback`. Order is normalised to `allowed`.
//
// Migration: if the array key is absent but the legacy single-combo keys
// (`ttnn-dash:v1:hw` + `:shape`) exist, seed the selection from that one combo so
// a returning user lands on what they were viewing before.
function usePersistedCombos(storageKey, allowed, fallback) {
  const norm = (arr) => allowed.filter((c) => arr.includes(c));
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const ok = norm(parsed);
          if (ok.length) return ok;
        }
      }
      // legacy single-combo → seed from hw_shape if it's a known combo
      const hw = localStorage.getItem('ttnn-dash:v1:hw');
      const shape = localStorage.getItem('ttnn-dash:v1:shape');
      if (hw && shape && allowed.includes(`${hw}_${shape}`)) return [`${hw}_${shape}`];
    } catch {
      // localStorage unavailable / bad JSON — use the default.
    }
    return fallback;
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Persisting is best-effort; in-memory state still drives the UI.
    }
  }, [storageKey, value]);
  return [value, setValue];
}

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [atHome, setAtHome] = useState(false);

  // Which (hardware × shape) combos to show — persisted multi-select, default the
  // one combo with deep history. Each selected combo becomes a sub-row per op in
  // the table (data source: data/workflow/<hw>/<shape>/, see dataLoader keys).
  const [selectedCombos, setSelectedCombos] = usePersistedCombos(
    'ttnn-dash:v1:combos', COMBOS, ['n150_small']
  );
  // Primary = first selected (fixed COMBOS order); drives the overview banner and
  // the sort/CSV/callout key. `comboKey` is a stable string dep for the load effect.
  const primaryCombo = selectedCombos[0];
  const comboKey = selectedCombos.join(',');

  // Theme: persisted, defaults to the OS preference on first visit. Applied as a
  // `.dark` class on <html> so the CSS dark: variant + .dark overrides take effect.
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('ttnn-dash:v1:theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // localStorage may be unavailable (private mode) — fall through to OS pref.
    }
    return typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('ttnn-dash:v1:theme', theme);
    } catch {
      // Persisting is best-effort; the in-memory state still drives the UI.
    }
  }, [theme]);

  // Memoized so it's a stable dependency for the load effect below (lets the
  // effect depend on loadData directly instead of suppressing exhaustive-deps).
  // Recreated only when the selection changes — exactly when we want to reload.
  // `comboKey` (comma-joined) is the stable primitive dep; the array identity
  // would change every render.
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const performanceData = await loadPerformanceMulti(comboKey.split(','));

      if (!performanceData) {
        throw new Error('Failed to load performance data');
      }

      setData(performanceData);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [comboKey]);

  // Load all remaining older days — fan out across the selected combos. Each combo
  // keeps its own file list + counters in data.byCombo, so we slice the unloaded
  // tail per combo, tag every fetched day with its __combo, and bump both the
  // per-combo and the summed counters. (Only n150_small has real depth today.)
  const loadAllData = async () => {
    if (!data || loadingAll || !data.byCombo) return;

    setLoadingAll(true);
    try {
      const perCombo = await Promise.all(
        Object.entries(data.byCombo).map(async ([combo, info]) => {
          const remaining = (info.files || []).slice(info.currentlyLoaded, info.totalAvailable);
          if (!remaining.length) return { combo, days: [], attempted: 0 };
          const days = await Promise.all(
            remaining.map(async (file) => {
              try {
                const response = await fetch(`${import.meta.env.BASE_URL}${file.path}`);
                const fileData = await response.json();
                return { ...fileData, filename: file.filename, date: file.measurement_date, __combo: combo };
              } catch (error) {
                console.error(`Error loading ${file.filename}:`, error);
                return null;
              }
            })
          );
          // Advance the cursor by files ATTEMPTED, not just parsed — otherwise a
          // permanently-bad file would sit at `currentlyLoaded` and get re-fetched
          // (duplicates) or retried forever on the next "Load all".
          return { combo, days: days.filter((d) => d !== null), attempted: remaining.length };
        })
      );

      const newDays = perCombo.flatMap((r) => r.days);
      const anyAttempted = perCombo.some((r) => r.attempted > 0);
      if (anyAttempted) {
        setData((prev) => {
          const byCombo = { ...prev.byCombo };
          for (const { combo, attempted } of perCombo) {
            if (!attempted) continue;
            byCombo[combo] = {
              ...byCombo[combo],
              currentlyLoaded: byCombo[combo].currentlyLoaded + attempted,
            };
          }
          return {
            ...prev,
            daily: [...prev.daily, ...newDays],
            byCombo,
            // Summed cursor also advances by attempted, so the header's
            // "showing X of Y" reaches Y and the Load-all button hides.
            currentlyLoaded: prev.currentlyLoaded + perCombo.reduce((n, r) => n + r.attempted, 0),
          };
        });
      }
    } catch (error) {
      console.error('Error loading all data:', error);
    } finally {
      setLoadingAll(false);
    }
  };

  // Reload whenever the selection changes (initial mount + any checkbox).
  // loadData is memoized on [comboKey], so depending on it is equivalent and keeps
  // exhaustive-deps satisfied without a suppression.
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reveal the admin "Subscribers" button only when the dashboard is opened from
  // the operator's home IP. This is UI-only; the subscriber data endpoint is
  // independently gated by a secret key, so a false positive here exposes nothing.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/context')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.atHome) setAtHome(true);
      })
      .catch(() => {
        /* not at home / endpoint unavailable → button stays hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const summaryStats = data ? calculateSummaryStats(data) : null;
  const processedOperations = data ? processOperationData(data) : [];

  const SkeletonBar = ({ className = '' }) => (
    <div className={`skeleton-shimmer rounded ${className}`} aria-hidden="true" />
  );

  const LoadingState = () => (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-gray-900 dark:to-indigo-950">
      <header className="header-gradient shadow-xl border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-y-3 py-3 sm:py-0 sm:h-20">
            <div className="flex items-center">
              <SkeletonBar className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl" />
              <div className="ml-3 sm:ml-4 space-y-2">
                <SkeletonBar className="h-5 w-40 sm:w-52" />
                <SkeletonBar className="h-3 w-28 sm:w-40" />
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <SkeletonBar className="h-10 w-10 sm:w-40 rounded-lg" />
              <SkeletonBar className="h-10 w-10 sm:w-32 rounded-lg" />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <div className="glass-card">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <SkeletonBar className="h-9 w-9 rounded-lg shrink-0" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <SkeletonBar className="h-3 w-20" />
                <SkeletonBar className="h-4 w-28" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <SkeletonBar className="h-7 w-64 sm:w-80" />
          <SkeletonBar className="h-4 w-72 sm:w-96" />
        </div>

        <div className="glass-card space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <SkeletonBar className="h-10 flex-1 min-w-[160px] rounded-lg" />
            <SkeletonBar className="h-10 w-32 rounded-lg" />
            <SkeletonBar className="h-10 w-32 rounded-lg" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <SkeletonBar className="h-8 w-32 sm:w-40 shrink-0" />
                <SkeletonBar className="h-8 w-24 sm:w-32 shrink-0" />
                {Array.from({ length: 6 }).map((_, j) => (
                  <SkeletonBar key={j} className="h-8 flex-1 min-w-[60px]" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>

      <span className="sr-only" role="status" aria-live="polite">
        Loading TTNN performance data…
      </span>
    </div>
  );

  const ErrorState = () => (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-gray-900 dark:to-indigo-950 flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="glass-card">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-6" />
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">Connection Issue</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
          <button 
            onClick={loadData}
            className="btn-primary inline-flex items-center"
          >
            <RefreshCw className="h-5 w-5 mr-2" />
            Retry Connection
          </button>
        </div>
      </div>
    </div>
  );

  if (loading) return <LoadingState />;
  if (error) return <ErrorState />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-gray-900 dark:to-indigo-950">
      {/* Enhanced Header */}
      <header className="header-gradient shadow-xl border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-y-3 py-3 sm:py-0 sm:h-20">
            <div className="flex items-center min-w-0">
              <div className="relative shrink-0">
                <div className="absolute inset-0 bg-blue-600 rounded-xl blur-lg opacity-30"></div>
                <div className="relative bg-gradient-to-br from-blue-500 to-indigo-600 p-2 sm:p-3 rounded-xl">
                  <Zap className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                </div>
              </div>
              <div className="ml-3 sm:ml-4 min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent truncate">
                  Tenstorrent TT-Metal
                </h1>
                <p className="text-sm sm:text-lg font-semibold text-gray-700 dark:text-gray-200 truncate">Eltwise Performance Tracker</p>
                <p className="hidden sm:flex text-sm text-gray-500 dark:text-gray-400 items-center">
                  <TrendingUp className="h-4 w-4 mr-1" />
                  Real-time operation performance monitoring
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
              {lastRefresh && (
                <div className="hidden md:block text-right">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Last Updated</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{lastRefresh.toLocaleTimeString()}</div>
                </div>
              )}
              <button
                onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                className="btn-secondary inline-flex items-center justify-center !px-2"
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <a
                href="https://ttnn-ops-coverage.aswincloud.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary border-beam inline-flex items-center relative !border-0"
                aria-label="Open the TTNN Ops Coverage Matrix (new — opens in a new tab)"
                title="TTNN Ops Coverage Matrix — pass/fail by dtype × layout × memory"
              >
                <LayoutGrid className="h-4 w-4 sm:mr-2 text-indigo-500 dark:text-indigo-300" />
                <span className="hidden sm:inline">Ops Coverage</span>
                <ExternalLink className="hidden sm:inline h-3 w-3 ml-1.5 opacity-60" />
                <span
                  className="ribbon-new pointer-events-none absolute -top-2 -right-2 select-none rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide text-white shadow-md ring-1 ring-white/70 dark:ring-slate-900"
                  aria-hidden="true"
                >New</span>
              </a>
              {atHome && (
                <button
                  onClick={() => setIsAdminOpen(true)}
                  className="btn-secondary inline-flex items-center justify-center !px-2"
                  aria-label="View subscribers (admin)"
                  title="Subscribers"
                >
                  <Users className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setIsSubscribeOpen(true)}
                className="btn-secondary inline-flex items-center"
                aria-label="Subscribe to performance alerts"
              >
                <Bell className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Get Alerts</span>
              </button>
              <button
                onClick={() => setIsCatalogOpen(true)}
                className="btn-secondary inline-flex items-center"
                aria-label="Operations Catalog"
              >
                <Book className="h-4 w-4 xl:mr-2" />
                <span className="hidden xl:inline">Operations Catalog</span>
              </button>
              <button
                onClick={loadData}
                className="btn-secondary inline-flex items-center"
                disabled={loading}
                aria-label="Refresh Data"
              >
                <RefreshCw className={`h-4 w-4 sm:mr-2 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh Data</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Overview Section */}
        <section className="fade-in">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Performance Overview</h2>
            <p className="text-gray-600 dark:text-gray-400">Key metrics and trends for TTNN eltwise operations</p>
          </div>
          {/* Overview banner reflects the PRIMARY (first-selected) combo; the
              "N combos" hint tells the reader the table is showing more. */}
          <OverviewCards
            summaryStats={summaryStats}
            hw={primaryCombo.split('_')[0]}
            shape={primaryCombo.split('_')[1]}
            comboCount={selectedCombos.length}
          />
        </section>

        {/* Performance Table Section */}
        <section className="slide-up">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Detailed Performance Analysis</h2>
              <p className="text-gray-600 dark:text-gray-400">Day-by-day performance comparison across all operations</p>
            </div>
            {/* Combo selector: check any subset of the 4 combos. Each selected
                combo becomes a sub-row per op in the table below. */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <ComboCheckboxes selected={selectedCombos} onChange={setSelectedCombos} />
            </div>
          </div>
                     <div className="glass-card">
             <PerformanceTable
               operations={processedOperations}
               dailyData={data?.daily || []}
               combos={selectedCombos}
               comboLabels={COMBO_LABEL}
               loadingAll={loadingAll}
               onLoadAllData={loadAllData}
               hasMoreDays={data ? data.currentlyLoaded < data.totalAvailable : false}
               totalAvailable={data?.totalAvailable || 0}
               currentlyLoaded={data?.currentlyLoaded || 0}
             />
           </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-16 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-t border-white/20 dark:border-slate-700/40">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-center sm:text-left">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              © {new Date().getFullYear()} Aswin. Thanks to the TT-Metal community for their amazing work.
            </div>
            <div className="flex items-center justify-center sm:justify-end flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
              <button
                type="button"
                onClick={() => setIsSubscribeOpen(true)}
                className="inline-flex items-center gap-1.5 hover:text-gray-900 dark:hover:text-white transition-colors"
                aria-label="Subscribe to performance alerts"
              >
                <Bell className="h-4 w-4" />
                <span>Get Alerts</span>
              </button>
              <span aria-hidden="true">•</span>
              <a
                href="https://github.com/Aswincloud/ttnn-performance-dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-gray-900 dark:hover:text-white transition-colors"
                aria-label="View source on GitHub"
              >
                <Github className="h-4 w-4" />
                <span>Source</span>
              </a>
              <span aria-hidden="true">•</span>
              <a
                href="https://github.com/Aswincloud/ttnn-performance-dashboard/issues/new/choose"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-gray-900 dark:hover:text-white transition-colors"
                aria-label="Report a bug on GitHub"
              >
                <Bug className="h-4 w-4" />
                <span>Report Bug</span>
              </a>
              <span aria-hidden="true">•</span>
              <a
                href="https://github.com/Aswincloud/ttnn-performance-dashboard/blob/main/CONTRIBUTING.md"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-gray-900 dark:hover:text-white transition-colors"
                aria-label="How to contribute"
              >
                <GitPullRequest className="h-4 w-4" />
                <span>Contribute</span>
              </a>
              <span aria-hidden="true">•</span>
              <span>Powered by TT-Metal</span>
              <span aria-hidden="true">•</span>
              <span>{summaryStats?.totalOperations || 0} Operations Tracked</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Catalog Modal */}
      <CatalogModal
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
      />

      {/* Alert Subscription Modal */}
      <SubscribeModal
        isOpen={isSubscribeOpen}
        onClose={() => setIsSubscribeOpen(false)}
      />

      {/* Admin Subscribers Modal (home-IP gated button; key-gated data) */}
      <AdminSubscribersModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
      />
    </div>
  );
}

export default App; 