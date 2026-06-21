// Utility functions to load and process performance data

const INITIAL_DAILY_FILES = 20;

export async function loadPerformanceData(limit = INITIAL_DAILY_FILES) {
  const base = import.meta.env.BASE_URL;
  try {
    // Load the index file to get available data files
    const indexResponse = await fetch(`${base}data/index.json`);
    const indexData = await indexResponse.json();
    
    // Load the latest results
    const latestResponse = await fetch(`${base}data/latest/latest_results.json`);
    const latestData = await latestResponse.json();
    
    // Only load the most recent N daily data files (instead of all 563!)
    const recentFiles = indexData.files.slice(0, limit);
    
    const dailyData = await Promise.all(
      recentFiles.map(async (file) => {
        try {
          const response = await fetch(`${base}${file.path}`);
          const data = await response.json();
          return {
            ...data,
            filename: file.filename,
            date: file.measurement_date
          };
        } catch (error) {
          console.error(`Error loading ${file.filename}:`, error);
          return null;
        }
      })
    );
    
    // Filter out any failed loads
    const validDailyData = dailyData.filter(d => d !== null);
    
    return {
      index: indexData,
      latest: latestData,
      daily: validDailyData,
      totalAvailable: indexData.files.length,
      currentlyLoaded: validDailyData.length
    };
  } catch (error) {
    console.error('Error loading performance data:', error);
    return null;
  }
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