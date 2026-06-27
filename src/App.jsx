import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, Zap, TrendingUp, Book, Github, Bug, GitPullRequest, Bell, Users, Sun, Moon, LayoutGrid, ExternalLink } from 'lucide-react';
import OverviewCards from './components/OverviewCards';
import PerformanceTable from './components/PerformanceTable';
import CatalogModal from './components/CatalogModal';
import SubscribeModal from './components/SubscribeModal';
import AdminSubscribersModal from './components/AdminSubscribersModal';
import {
  loadPerformanceData,
  processOperationData,
  calculateSummaryStats,
} from './utils/dataLoader';

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

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const performanceData = await loadPerformanceData();
      
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
  };

  // Manual function to load all remaining data
  const loadAllData = async () => {
    if (!data || loadingAll) return;
    
    setLoadingAll(true);
    
    const startIndex = data.currentlyLoaded;
    const totalToLoad = data.totalAvailable;
    
    console.log(`🔄 Loading all remaining data from ${startIndex} to ${totalToLoad} days...`);
    
    try {
      // Load ALL remaining data in one go
      const remainingFiles = data.index.files.slice(startIndex, totalToLoad);
      
      const allNewData = await Promise.all(
        remainingFiles.map(async (file) => {
          try {
            const response = await fetch(`${import.meta.env.BASE_URL}${file.path}`);
            const fileData = await response.json();
            return {
              ...fileData,
              filename: file.filename,
              date: file.measurement_date
            };
          } catch (error) {
            console.error(`Error loading ${file.filename}:`, error);
            return null;
          }
        })
      );
      
      // Filter out failed loads
      const validNewData = allNewData.filter(d => d !== null);
      
      if (validNewData.length > 0) {
        // Update frontend only once with all data
        setData(prevData => ({
          ...prevData,
          daily: [...prevData.daily, ...validNewData],
          currentlyLoaded: prevData.currentlyLoaded + validNewData.length
        }));
        
        console.log(`✅ All data loaded! Loaded ${validNewData.length} additional days. Total: ${startIndex + validNewData.length} days`);
      }
    } catch (error) {
      console.error('Error loading all data:', error);
    } finally {
      setLoadingAll(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

            <div className="flex items-center gap-2 sm:gap-4 lg:gap-6">
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
                className="btn-secondary inline-flex items-center"
                aria-label="Open the TTNN Ops Coverage Matrix (opens in a new tab)"
                title="TTNN Ops Coverage Matrix — pass/fail by dtype × layout × memory"
              >
                <LayoutGrid className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Ops Coverage</span>
                <ExternalLink className="hidden sm:inline h-3 w-3 ml-1.5 opacity-60" />
              </a>
              {atHome && (
                <button
                  onClick={() => setIsAdminOpen(true)}
                  className="btn-secondary inline-flex items-center"
                  aria-label="View subscribers (admin)"
                >
                  <Users className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Subscribers</span>
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
                <Book className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Operations Catalog</span>
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
          <OverviewCards summaryStats={summaryStats} />
        </section>

        {/* Performance Table Section */}
        <section className="slide-up">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Detailed Performance Analysis</h2>
            <p className="text-gray-600 dark:text-gray-400">Day-by-day performance comparison across all operations</p>
          </div>
                     <div className="glass-card">
             <PerformanceTable 
               operations={processedOperations}
               dailyData={data?.daily || []}
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