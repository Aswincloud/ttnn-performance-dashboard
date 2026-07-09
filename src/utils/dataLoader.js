// Utility functions to load and process performance data

const INITIAL_DAILY_FILES = 20;

// The default combo — the only one guaranteed to have data on first deploy (via
// the legacy fallback below), so the app always boots to a populated view.
export const DEFAULT_COMBO = 'n150_small';

// An empty-but-valid result: a combo the pipeline hasn't produced yet (e.g. P100a
// before its first run). `latest: null` (NOT an empty-shaped object) is deliberate
// — calculateSummaryStats divides by result counts and would render NaN/Infinity
// on an empty latest, whereas it null-guards `latest: null` cleanly.
function emptyResult() {
  return {
    index: { files: [] },
    latest: null,
    daily: [],
    totalAvailable: 0,
    currentlyLoaded: 0,
  };
}

// Load the first `limit` files of a per-combo file list into the daily[] shape
// PerformanceTable expects. Tolerant: a file that 404s / fails to parse is
// dropped, not fatal (mirrors the original loop).
async function loadDailyFiles(base, files, limit) {
  const recent = files.slice(0, limit);
  const loaded = await Promise.all(
    recent.map(async (file) => {
      try {
        const response = await fetch(`${base}${file.path}`);
        const data = await response.json();
        return { ...data, filename: file.filename, date: file.measurement_date };
      } catch (error) {
        console.error(`Error loading ${file.filename}:`, error);
        return null;
      }
    })
  );
  return loaded.filter((d) => d !== null);
}

// The pre-workflow behavior, kept verbatim as the n150_small fallback: read the
// legacy index + latest_results.json. Used when data/workflow/index.json doesn't
// exist yet (first deploy, before the generator has ever run) or lacks the combo.
async function loadLegacy(base, limit) {
  const indexResponse = await fetch(`${base}data/index.json`);
  const indexData = await indexResponse.json();
  const latestResponse = await fetch(`${base}data/latest/latest_results.json`);
  const latestData = await latestResponse.json();
  const validDailyData = await loadDailyFiles(base, indexData.files, limit);
  return {
    index: indexData,
    latest: latestData,
    daily: validDailyData,
    totalAvailable: indexData.files.length,
    currentlyLoaded: validDailyData.length,
  };
}

export async function loadPerformanceData(combo = DEFAULT_COMBO, limit = INITIAL_DAILY_FILES) {
  const base = import.meta.env.BASE_URL;
  try {
    // The per-combo index (2 boards x 2 shapes) written by generate_workflow_index.py.
    let workflowIndex = null;
    try {
      const res = await fetch(`${base}data/workflow/index.json`);
      if (res.ok) workflowIndex = await res.json();
    } catch {
      // 404 / parse failure => treat as "not generated yet" and fall through.
    }

    const entry = workflowIndex?.combos?.[combo];

    // No workflow index (or this combo absent): fall back to the legacy source
    // for the default combo, and to an empty-but-valid view for the rest — so a
    // not-yet-populated combo shows the empty state, never a crash.
    if (!entry) {
      if (combo === DEFAULT_COMBO) return await loadLegacy(base, limit);
      return emptyResult();
    }

    // Latest snapshot: may be null (empty combo) or a path; a bad fetch is
    // swallowed to null so the UI degrades to its no-stats banner.
    let latestData = null;
    if (entry.latest) {
      try {
        const res = await fetch(`${base}${entry.latest}`);
        if (res.ok) latestData = await res.json();
      } catch {
        latestData = null;
      }
    }

    // Coerce to an array: a malformed index (files missing or non-array) must
    // not let `.slice()` throw and break the never-throws fallback contract.
    const files = Array.isArray(entry.files) ? entry.files : [];
    const validDailyData = await loadDailyFiles(base, files, limit);

    return {
      // Keep `index.files` populated so loadAllData + the "Load all N days"
      // counters keep working per-combo.
      index: { files },
      latest: latestData,
      daily: validDailyData,
      totalAvailable: entry.totalAvailable ?? files.length,
      currentlyLoaded: validDailyData.length,
    };
  } catch (error) {
    console.error('Error loading performance data:', error);
    return null;
  }
}

// Load SEVERAL combos at once for the multi-select (per-combo sub-rows) view.
// Each combo is loaded with the existing single-combo loader, then its daily
// files are tagged with `__combo` and merged into one flat `daily[]` — the shape
// PerformanceTable already consumes, now with a combo discriminator so it can
// split each op into one sub-row per combo. A `byCombo` map is kept so the
// "Load all older days" fan-out can keep each combo's own file list + counters.
//
// The header counters (totalAvailable / currentlyLoaded) are SUMS across combos.
// `latest` for OverviewCards / summary stats is the PRIMARY (first-selected)
// combo's latest — the overview banner stays single-combo by design.
export async function loadPerformanceMulti(combos, limit = INITIAL_DAILY_FILES) {
  const list = Array.isArray(combos) && combos.length ? combos : [DEFAULT_COMBO];
  const results = await Promise.all(list.map((c) => loadPerformanceData(c, limit)));

  const daily = [];
  const byCombo = {};
  let totalAvailable = 0;
  let currentlyLoaded = 0;

  list.forEach((combo, i) => {
    // loadPerformanceData never throws, but returns null on a catastrophic error;
    // treat that as an empty combo so one bad combo can't sink the whole view.
    const r = results[i] || emptyResult();
    for (const d of r.daily) daily.push({ ...d, __combo: combo });
    byCombo[combo] = {
      files: r.index?.files || [],
      latest: r.latest,
      totalAvailable: r.totalAvailable || 0,
      currentlyLoaded: r.currentlyLoaded || 0,
    };
    totalAvailable += r.totalAvailable || 0;
    currentlyLoaded += r.currentlyLoaded || 0;
  });

  const primary = list[0];
  return {
    combos: list,
    primary,
    // Single-combo latest the overview + summary read (may be null for an
    // empty primary combo — calculateSummaryStats null-guards it).
    latest: byCombo[primary]?.latest ?? null,
    daily,
    byCombo,
    totalAvailable,
    currentlyLoaded,
  };
}

export function processOperationData(data) {
  if (!data?.latest?.results) return [];
  
  return data.latest.results.map(result => ({
    ...result,
    average_duration_ms: (result.average_duration_ns / 1000000).toFixed(3),
    min_duration_ms: (result.min_duration_ns / 1000000).toFixed(3),
    max_duration_ms: (result.max_duration_ns / 1000000).toFixed(3),
    std_deviation_ms: (result.std_deviation_ns / 1000000).toFixed(3),
    performance_rating: getPerformanceRating(result.average_duration_ns)
  }));
}

export function calculateSummaryStats(data) {
  if (!data?.latest?.metadata) return null;
  
  const metadata = data.latest.metadata;
  const results = (data.latest.results || []).filter(r => r.operation_name !== 'argmax');
  
  const totalOperations = results.length;
  const avgDuration = results.reduce((sum, r) => sum + r.average_duration_ns, 0) / totalOperations / 1000000;
  const fastestOperation = results.reduce((min, r) => 
    r.average_duration_ns < min.average_duration_ns ? r : min, results[0]);
  const slowestOperation = results.reduce((max, r) => 
    r.average_duration_ns > max.average_duration_ns ? r : max, results[0]);
  
  return {
    totalTests: metadata.total_tests,
    successfulTests: metadata.successful_tests,
    failedTests: metadata.failed_tests,
    successRate: ((metadata.successful_tests / metadata.total_tests) * 100).toFixed(1),
    totalOperations,
    avgDuration: avgDuration.toFixed(3),
    fastestOperation: fastestOperation?.operation_name || 'N/A',
    slowestOperation: slowestOperation?.operation_name || 'N/A',
    lastUpdated: metadata.measurement_date,
    gitCommit: metadata.git_commit_id?.substring(0, 8) || 'N/A',
    // Full SHA kept so the UI can link/copy the real commit, not just the
    // truncated display value.
    gitCommitFull: metadata.git_commit_id || null
  };
}

function getPerformanceRating(durationNs) {
  const durationMs = durationNs / 1000000;
  if (durationMs < 10) return 'excellent';
  if (durationMs < 25) return 'good';
  if (durationMs < 50) return 'fair';
  return 'needs-improvement';
}

export function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString();
}

export function formatDuration(nanoseconds) {
  const ms = nanoseconds / 1000000;
  if (ms < 1) return `${(nanoseconds / 1000).toFixed(1)}μs`;
  if (ms < 1000) return `${ms.toFixed(3)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
} 