import React, { useState, useMemo, useRef, useEffect, Suspense, lazy } from 'react';
import { Search, ChevronUp, ChevronDown, Filter, BarChart3, TrendingUp, TrendingDown, Minus, Eye, EyeOff, Loader2, Download, X } from 'lucide-react';
import { operationsCatalog } from '../utils/operationsCatalog.js';

// Recharts is heavy (~110KB gzipped) and only needed when the user opens the
// trend modal or switches to chart view. Lazy-load so it stays out of the
// initial bundle.
const TrendLineChart = lazy(() => import('./TrendLineChart.jsx'));

const ChartFallback = ({ height }) => (
  <div className="flex items-center justify-center text-sm text-gray-400" style={{ height }}>
    <Loader2 className="h-4 w-4 animate-spin mr-2" />
    Loading chart…
  </div>
);

// Color legend for the cell background gradient. The swatch classes here MUST
// mirror the thresholds in getPerformanceColor — they're the key that makes the
// 13-shade gradient readable as data. Module-level so it isn't recreated on each
// render (react-hooks/static-components).
const LEGEND_IMPROVE = [
  { cls: 'bg-green-300', label: '>25%' },
  { cls: 'bg-green-200', label: '20' },
  { cls: 'bg-green-150', label: '15' },
  { cls: 'bg-green-100', label: '10' },
  { cls: 'bg-green-50', label: '5' },
  { cls: 'bg-green-25', label: '2%' },
];
const LEGEND_DEGRADE = [
  { cls: 'bg-red-25', label: '2%' },
  { cls: 'bg-red-50', label: '5' },
  { cls: 'bg-red-100', label: '10' },
  { cls: 'bg-red-150', label: '15' },
  { cls: 'bg-red-200', label: '20' },
  { cls: 'bg-red-300', label: '>25%' },
];

const PerformanceLegend = () => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500 px-1 pb-3">
    <span className="font-medium text-green-700">Faster</span>
    <div className="flex items-center">
      {LEGEND_IMPROVE.map((s) => (
        <span
          key={s.cls}
          className={`${s.cls} inline-flex items-center justify-center h-4 min-w-[1.75rem] px-1 text-[10px] text-gray-700 border border-black/5 first:rounded-l last:rounded-r`}
          title={`Improvement around ${s.label}`}
        >
          {s.label}
        </span>
      ))}
    </div>
    <span className="inline-flex items-center justify-center h-4 min-w-[2.5rem] px-1 text-[10px] text-gray-400 bg-white border border-gray-200 rounded">
      ±2%
    </span>
    <div className="flex items-center">
      {LEGEND_DEGRADE.map((s) => (
        <span
          key={s.cls}
          className={`${s.cls} inline-flex items-center justify-center h-4 min-w-[1.75rem] px-1 text-[10px] text-gray-700 border border-black/5 first:rounded-l last:rounded-r`}
          title={`Degradation around ${s.label}`}
        >
          {s.label}
        </span>
      ))}
    </div>
    <span className="font-medium text-red-700">Slower</span>
    <span className="text-gray-400">· vs previous day</span>
  </div>
);

// Versioned key so we can invalidate persisted prefs if the schema ever changes
// (e.g. category names rename, sort keys change). Bump suffix to force-reset.
const PREFS_PREFIX = 'ttnn-dash:v1:';

const usePersistedState = (key, initialValue) => {
  const storageKey = `${PREFS_PREFIX}${key}`;
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw !== null ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Ignore quota / private-mode failures; in-memory state still works.
    }
  }, [storageKey, value]);
  return [value, setValue];
};

const RowSparkline = ({ values, width = 80, height = 22, maxPoints = 30 }) => {
  if (!values || values.length < 2) {
    return <span className="text-xs text-gray-300">—</span>;
  }

  // Cap to most recent N points so the line stays readable when the user
  // has loaded hundreds of days. The full chart is one click away in the modal.
  const trimmed = values.length > maxPoints ? values.slice(-maxPoints) : values;

  const min = Math.min(...trimmed);
  const max = Math.max(...trimmed);
  const range = max - min || 1;
  const step = trimmed.length > 1 ? width / (trimmed.length - 1) : 0;

  const points = trimmed.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  const pct = ((last - first) / first) * 100;
  const trend = pct <= -2 ? 'better' : pct >= 2 ? 'worse' : 'flat';
  const stroke = trend === 'better' ? '#16a34a' : trend === 'worse' ? '#dc2626' : '#94a3b8';
  const fill = trend === 'better' ? 'rgba(22, 163, 74, 0.10)' : trend === 'worse' ? 'rgba(220, 38, 38, 0.10)' : 'rgba(148, 163, 184, 0.10)';

  const areaPoints = `0,${height} ${points.join(' ')} ${width},${height}`;
  const lastY = height - ((last - min) / range) * height;

  return (
    <svg width={width} height={height} className="block" aria-hidden="true">
      <polygon points={areaPoints} fill={fill} />
      <polyline points={points.join(' ')} fill="none" stroke={stroke} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={lastY} r="1.75" fill={stroke} />
    </svg>
  );
};

const PerformanceTable = ({ dailyData, loadingAll, onLoadAllData, hasMoreDays, totalAvailable, currentlyLoaded }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = usePersistedState('sortConfig', { key: 'operation_name', direction: 'asc' });
  const [selectedUnit, setSelectedUnit] = usePersistedState('selectedUnit', 'ns');
  const [performanceSort, setPerformanceSort] = usePersistedState('performanceSort', 'none');
  const [selectedCategories, setSelectedCategories] = usePersistedState('selectedCategories', [
    'Unary', 'Binary Arithmetic', 'Binary Comparison', 'Binary Logical',
    'Ternary', 'Reduction', 'Complex'
  ]);
  const [showFilters, setShowFilters] = useState(false);
  const [showAllColumns, setShowAllColumns] = usePersistedState('showAllColumns', true);
  const [groupByCategory, setGroupByCategory] = usePersistedState('groupByCategory', false);
  const [viewMode, setViewMode] = usePersistedState('viewMode', 'table');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [chartModalOp, setChartModalOp] = useState(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const filterRef = useRef(null);
  const tableScrollRef = useRef(null);
  const exportRef = useRef(null);

  useEffect(() => {
    if (!chartModalOp) return;
    const onKey = (e) => { if (e.key === 'Escape') setChartModalOp(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chartModalOp]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setShowFilters(false);
      }
      if (exportRef.current && !exportRef.current.contains(event.target)) {
        setShowExportMenu(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle view mode change with transition
  const handleViewModeChange = (newMode) => {
    if (newMode === viewMode) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setViewMode(newMode);
      setTimeout(() => setIsTransitioning(false), 50);
    }, 150);
  };



  const convertFromNanoseconds = (nanoseconds, unit) => {
    switch (unit) {
      case 'ns':
        return { value: nanoseconds, decimals: 0 };
      case 'μs':
        return { value: nanoseconds / 1000, decimals: 1 };
      case 'ms':
        return { value: nanoseconds / 1000000, decimals: 3 };
      case 's':
        return { value: nanoseconds / 1000000000, decimals: 6 };
      default:
        return { value: nanoseconds / 1000000, decimals: 3 };
    }
  };

  const formatValue = (nanoseconds, unit) => {
    const converted = convertFromNanoseconds(nanoseconds, unit);
    return converted.value.toFixed(converted.decimals);
  };

  // Build a compact "Mon D" label from a YYYY-MM-DD string without going
  // through Date parsing, which would shift the day in non-UTC zones.
  const formatCompactDate = (isoDate) => {
    if (!isoDate || isoDate.length < 10) return isoDate;
    const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleString('en-US', { month: 'short', day: 'numeric' });
  };

  const getPerformanceColor = (currentValue, previousValue, isFirstColumn) => {
    // First column (baseline) has no color
    if (isFirstColumn) return 'bg-white';
    
    if (!previousValue || !currentValue) return 'bg-white';
    
    // Calculate percentage change from previous day
    const changePercent = ((currentValue - previousValue) / previousValue) * 100;
    
    // More granular color gradients based on change from previous day
    // Performance improved (faster = negative change)
    if (changePercent <= -25) return 'bg-green-300 text-green-900';      // >25% improvement
    if (changePercent <= -20) return 'bg-green-200 text-green-900';      // 20-25% improvement
    if (changePercent <= -15) return 'bg-green-150 text-green-800';      // 15-20% improvement  
    if (changePercent <= -10) return 'bg-green-100 text-green-800';      // 10-15% improvement
    if (changePercent <= -5) return 'bg-green-50 text-green-700';        // 5-10% improvement
    if (changePercent <= -2) return 'bg-green-25 text-green-600';        // 2-5% improvement
    
    // Performance stable (within ±2%)
    if (changePercent >= -2 && changePercent <= 2) return 'bg-white';
    
    // Performance degraded (slower = positive change)
    if (changePercent <= 5) return 'bg-red-25 text-red-600';             // 2-5% degradation
    if (changePercent <= 10) return 'bg-red-50 text-red-700';            // 5-10% degradation
    if (changePercent <= 15) return 'bg-red-100 text-red-800';           // 10-15% degradation
    if (changePercent <= 20) return 'bg-red-150 text-red-800';           // 15-20% degradation
    if (changePercent <= 25) return 'bg-red-200 text-red-900';           // 20-25% degradation
    return 'bg-red-300 text-red-900';                                    // >25% degradation
   };

  const getOperationCategory = (operationName) => {
    const name = operationName.toLowerCase();
    const categories = operationsCatalog.categories;
    
    // Check Backward operations first (most specific)
    if (categories.backward.subcategories.unary_backward.operations.includes(name)) return 'Unary Backward';
    if (categories.backward.subcategories.binary_backward.operations.includes(name)) return 'Binary Backward';
    if (categories.backward.subcategories.ternary_backward.operations.includes(name)) return 'Ternary Backward';
    if (categories.backward.subcategories.reduction_backward.operations.includes(name)) return 'Reduction Backward';
    
    // Check Complex operations
    for (const subcat of Object.values(categories.complex.subcategories)) {
      if (subcat.operations.includes(name)) return 'Complex';
    }
    
    // Check Reduction operations
    if (categories.reduction.operations.includes(name)) return 'Reduction';
    
    // Check Ternary operations
    if (categories.ternary.operations.includes(name)) return 'Ternary';
    
    // Check Binary operations with more granular categories
    if (categories.binary.subcategories.arithmetic.operations.includes(name)) return 'Binary Arithmetic';
    if (categories.binary.subcategories.arithmetic_inplace.operations.includes(name)) return 'Binary Inplace';
    if (categories.binary.subcategories.comparison.operations.includes(name)) return 'Binary Comparison';
    if (categories.binary.subcategories.comparison_inplace.operations.includes(name)) return 'Binary Inplace';
    if (categories.binary.subcategories.logical.operations.includes(name)) return 'Binary Logical';
    if (categories.binary.subcategories.logical_inplace.operations.includes(name)) return 'Binary Inplace';
    if (categories.binary.subcategories.bitwise.operations.includes(name)) return 'Binary Logical';
    if (categories.binary.subcategories.mathematical.operations.includes(name)) return 'Binary Arithmetic';
    if (categories.binary.subcategories.mathematical_inplace.operations.includes(name)) return 'Binary Inplace';
    if (categories.binary.subcategories.advanced.operations.includes(name)) return 'Binary Arithmetic';
    
    // Check Unary operations
    if (categories.unary.subcategories.unary_inplace.operations.includes(name)) return 'Unary Inplace';
    
    // Check other unary subcategories
    for (const subcat of Object.values(categories.unary.subcategories)) {
      if (subcat.operations.includes(name)) return 'Unary';
    }
    
    // Default to Unary if not found
    return 'Unary';
  };

    const getCategoryColor = (category) => {
    const colors = {
      'Unary': 'bg-blue-100 text-blue-800',
      'Unary Inplace': 'bg-blue-200 text-blue-900',
      'Binary Arithmetic': 'bg-green-100 text-green-800',
      'Binary Comparison': 'bg-green-200 text-green-900',
      'Binary Logical': 'bg-green-300 text-green-900',
      'Binary Inplace': 'bg-green-400 text-green-900',
      'Ternary': 'bg-purple-100 text-purple-800',
      'Reduction': 'bg-orange-100 text-orange-800',
      'Unary Backward': 'bg-gray-100 text-gray-800',
      'Binary Backward': 'bg-gray-200 text-gray-800',
      'Ternary Backward': 'bg-gray-300 text-gray-800',
      'Reduction Backward': 'bg-gray-400 text-gray-800',
      'Complex': 'bg-pink-100 text-pink-800'
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };



  const calculatePerformanceChange = (operation, dateColumns) => {
    if (!dateColumns || dateColumns.length < 2) return 0;
    
    // Compare the last two days (yesterday vs today)
    const previousValue = operation.dailyPerformance[dateColumns[dateColumns.length - 2].date]?.duration_ns;
    const currentValue = operation.dailyPerformance[dateColumns[dateColumns.length - 1].date]?.duration_ns;
    
    if (!previousValue || !currentValue) return 0;
    
    // Negative means improvement (faster), positive means degradation (slower)
    return ((currentValue - previousValue) / previousValue) * 100;
  };

  const processedData = useMemo(() => {
    if (!dailyData || dailyData.length === 0) return [];

    // Sort daily data by date
    const sortedDailyData = [...dailyData].sort((a, b) => 
      new Date(a.metadata.measurement_date) - new Date(b.metadata.measurement_date)
    );

    // Get all unique operations (exclude argmax as it's been removed)
    const allOperations = new Set();
    sortedDailyData.forEach(day => {
      day.results.forEach(result => {
        if (result.operation_name !== 'argmax') {
          allOperations.add(result.operation_name);
        }
      });
    });

    // Create data structure for table
    return Array.from(allOperations).map(operationName => {
      const operationData = {
        operation_name: operationName,
        dailyPerformance: {}
      };

      sortedDailyData.forEach(day => {
        // measurement_date is timezone-naive ISO (e.g. "2026-05-24T02:06:53").
        // Slicing the raw string keeps the key on the dataset's intended calendar
        // day; routing through new Date()/toISOString() would shift it by the
        // viewer's UTC offset.
        const dateKey = day.metadata.measurement_date.slice(0, 10);
        const operation = day.results.find(r => r.operation_name === operationName);
        
        if (operation) {
          operationData.dailyPerformance[dateKey] = {
            duration_ns: operation.average_duration_ns,
            successful_runs: operation.successful_runs,
            test_name: operation.test_name
          };
        } else {
          operationData.dailyPerformance[dateKey] = null;
        }
      });

      return operationData;
    });
  }, [dailyData]);

  // All date columns without any filtering (for "All Available Days" export)
  const allDateColumns = useMemo(() => {
    if (!dailyData || dailyData.length === 0) return [];
    
    // Use a Map to deduplicate by date, keeping the latest entry for each date
    const dateMap = new Map();
    
    [...dailyData]
      .sort((a, b) => new Date(a.metadata.measurement_date) - new Date(b.metadata.measurement_date))
      .forEach(day => {
        const dateStr = day.metadata.measurement_date.slice(0, 10);
        // Keep the latest entry for each date (overwrite if duplicate)
        dateMap.set(dateStr, {
          date: dateStr,
          rawDate: new Date(day.metadata.measurement_date),
          commitId: day.metadata.git_commit_id?.substring(0, 8) || 'N/A'
        });
      });
    
    return Array.from(dateMap.values());
  }, [dailyData]);

  // Latest-day callout: top regressions and improvements vs the day before,
  // based on ALL loaded data (not user filters). Returns null if there is no
  // prior day to compare against or no change crosses the 5% threshold.
  const latestDayDelta = useMemo(() => {
    if (allDateColumns.length < 2 || processedData.length === 0) return null;

    const latestDate = allDateColumns[allDateColumns.length - 1].date;
    const prevDate = allDateColumns[allDateColumns.length - 2].date;
    const THRESHOLD = 5;

    const changes = [];
    for (const op of processedData) {
      const latest = op.dailyPerformance[latestDate]?.duration_ns;
      const prev = op.dailyPerformance[prevDate]?.duration_ns;
      if (!latest || !prev) continue;
      const pct = ((latest - prev) / prev) * 100;
      if (Math.abs(pct) >= THRESHOLD) changes.push({ name: op.operation_name, pct });
    }

    if (changes.length === 0) return null;

    const regressions = changes.filter(c => c.pct > 0).sort((a, b) => b.pct - a.pct);
    const improvements = changes.filter(c => c.pct < 0).sort((a, b) => a.pct - b.pct);

    return {
      latestDate,
      threshold: THRESHOLD,
      regressionCount: regressions.length,
      improvementCount: improvements.length,
      topRegressions: regressions.slice(0, 3),
      topImprovements: improvements.slice(0, 3),
    };
  }, [processedData, allDateColumns]);

  // Filtered date columns (respects date range filter)
  const dateColumns = useMemo(() => {
    if (!allDateColumns || allDateColumns.length === 0) return [];
    
    // Filter by date range if specified
    if (dateRange.start || dateRange.end) {
      return allDateColumns.filter(col => {
        // Get date in YYYY-MM-DD format for comparison
        const year = col.rawDate.getFullYear();
        const month = String(col.rawDate.getMonth() + 1).padStart(2, '0');
        const day = String(col.rawDate.getDate()).padStart(2, '0');
        const colDateString = `${year}-${month}-${day}`;
        
        const include = !(
          (dateRange.start && colDateString < dateRange.start) ||
          (dateRange.end && colDateString > dateRange.end)
        );
        
        return include;
      });
    }
    
    return allDateColumns;
  }, [allDateColumns, dateRange]);

  // Determine which columns have significant performance changes (after date range filtering)
  const significantColumns = useMemo(() => {
    if (!processedData || dateColumns.length < 2) return dateColumns;
    
    const significantDates = new Set();
    
    // Always include the first column (baseline)
    if (dateColumns.length > 0) {
      significantDates.add(dateColumns[0].date);
    }
    
    // Check each subsequent column for significant changes
    for (let i = 1; i < dateColumns.length; i++) {
      const currentDate = dateColumns[i].date;
      const previousDate = dateColumns[i - 1].date;
      
      let significantOperations = 0;
      let totalOperations = 0;
      
      processedData.forEach(operation => {
        const currentPerf = operation.dailyPerformance[currentDate];
        const previousPerf = operation.dailyPerformance[previousDate];
        
        if (currentPerf && previousPerf) {
          const changePercent = ((currentPerf.duration_ns - previousPerf.duration_ns) / previousPerf.duration_ns) * 100;
          totalOperations++;
          
          // Consider significant if >5% improvement or >10% degradation
          if (changePercent <= -5 || changePercent >= 10) {
            significantOperations++;
          }
        }
      });
      
      // Include column if at least 10% of operations have significant changes
      const significanceThreshold = Math.max(1, Math.floor(totalOperations * 0.1));
      if (significantOperations >= significanceThreshold) {
        significantDates.add(currentDate);
      }
    }
    
    // Always include the last column (latest results)
    if (dateColumns.length > 0) {
      significantDates.add(dateColumns[dateColumns.length - 1].date);
    }
    
    return dateColumns.filter(col => significantDates.has(col.date));
  }, [processedData, dateColumns]);

  // Use filtered or all columns based on toggle
  const displayedDateColumns = useMemo(() => {
    return showAllColumns ? dateColumns : significantColumns;
  }, [showAllColumns, dateColumns, significantColumns]);

  const filteredAndSortedData = useMemo(() => {
    let filtered = processedData.filter(op => {
      const matchesSearch = op.operation_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(getOperationCategory(op.operation_name));
      return matchesSearch && matchesCategory;
    });

    // Handle performance-based sorting
    if (performanceSort !== 'none') {
      filtered = filtered.sort((a, b) => {
        const aChange = calculatePerformanceChange(a, dateColumns);
        const bChange = calculatePerformanceChange(b, dateColumns);
        
        if (performanceSort === 'most-improved') {
          return aChange - bChange; // Most negative (improved) first
        } else if (performanceSort === 'most-degraded') {
          return bChange - aChange; // Most positive (degraded) first
        }
        return 0;
      });
    } else {
      // Handle regular column sorting
      filtered = filtered.sort((a, b) => {
        if (sortConfig.key === 'operation_name') {
          const aValue = a.operation_name;
          const bValue = b.operation_name;
          if (sortConfig.direction === 'asc') {
            return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
          } else {
            return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
          }
        } else {
          // Sorting by a date column
          const aValue = a.dailyPerformance[sortConfig.key]?.duration_ns || Infinity;
          const bValue = b.dailyPerformance[sortConfig.key]?.duration_ns || Infinity;
          
          if (sortConfig.direction === 'asc') {
            return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
          } else {
            return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
          }
        }
      });
    }

    return filtered;
  }, [processedData, searchTerm, sortConfig, performanceSort, dateColumns, selectedCategories]);

  // Auto-scroll to rightmost column (latest results) on data load
  useEffect(() => {
    if (tableScrollRef.current && displayedDateColumns.length > 0) {
      // Small delay to ensure table is rendered
      setTimeout(() => {
        tableScrollRef.current.scrollLeft = tableScrollRef.current.scrollWidth;
      }, 100);
    }
  }, [displayedDateColumns.length, filteredAndSortedData.length]);

  const handleSort = (key) => {
    setPerformanceSort('none'); // Reset performance sort when clicking column headers
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handlePerformanceSort = (sortType) => {
    setPerformanceSort(sortType);
    setSortConfig({ key: 'operation_name', direction: 'asc' }); // Reset column sort
  };

  const handleCategoryToggle = (category) => {
    setSelectedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const getPerformanceChange = (current, previous) => {
    if (!current || !previous) return null;
    
    const currentVal = current.duration_ns;
    const previousVal = previous.duration_ns;
    const change = ((currentVal - previousVal) / previousVal * 100);
    
    return {
      percentage: change.toFixed(1),
      trend: change > 5 ? 'worse' : change < -5 ? 'better' : 'stable'
    };
  };

  const SortableHeader = ({ children, sortKey, className = "" }) => (
    <th 
      className={`table-header cursor-pointer hover:bg-gray-100 ${className}`}
      onClick={() => handleSort(sortKey)}
    >
      <div className="flex items-center justify-center relative">
        <span>{children}</span>
        {sortConfig.key === sortKey && (
          <div className="absolute right-0">
            {sortConfig.direction === 'desc' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </div>
        )}
      </div>
    </th>
  );

  // Group data by category. Declared before any early return so the hook order
  // stays identical on every render (react-hooks/rules-of-hooks).
  const groupedData = useMemo(() => {
    if (!groupByCategory) return null;

    const grouped = {};
    filteredAndSortedData.forEach(op => {
      const category = getOperationCategory(op.operation_name);
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(op);
    });

    return grouped;
  }, [groupByCategory, filteredAndSortedData]);

  if (!dailyData || dailyData.length === 0) {
    return (
      <div className="card">
        <div className="text-center py-12">
          <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Performance Data</h3>
          <p className="text-gray-500">Performance data will appear here once measurements are available.</p>
        </div>
      </div>
    );
  }

  // Export function
  const exportAsCSV = (exportType = 'current') => {
    let columnsToExport = displayedDateColumns;
    
    // Determine which columns to export based on type
    if (exportType === 'latest') {
      columnsToExport = allDateColumns.length > 0 ? [allDateColumns[allDateColumns.length - 1]] : [];
    } else if (exportType === 'all') {
      columnsToExport = allDateColumns; // Use ALL date columns, ignoring filters
    } else if (exportType === 'dateRange') {
      // Use current date range filtered columns
      columnsToExport = displayedDateColumns;
    }
    // 'current' uses displayedDateColumns as is
    
    const headers = ['Operation', 'Category', ...columnsToExport.map(d => `${d.date} (${d.commitId})`)];
    const rows = filteredAndSortedData.map(op => [
      op.operation_name,
      getOperationCategory(op.operation_name),
      ...columnsToExport.map(d => {
        const data = op.dailyPerformance[d.date];
        return data ? `${formatValue(data.duration_ns, selectedUnit)}${selectedUnit}` : 'N/A';
      })
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const typeLabel = exportType === 'latest' ? 'latest' : exportType === 'all' ? 'all' : 'filtered';
    a.download = `ttnn-performance-${typeLabel}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  return (
    <div className="card">
      {latestDayDelta && (
        <div className="mb-5 border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Latest day · {formatCompactDate(latestDayDelta.latestDate)}
            </div>
            <div className="text-xs text-gray-500">vs. previous day · ≥{latestDayDelta.threshold}% change</div>
          </div>
          <div className="flex flex-col sm:flex-row">
            {latestDayDelta.topRegressions.length > 0 && (
              <div className={`flex-1 px-4 py-3 bg-red-50/40 ${latestDayDelta.topImprovements.length > 0 ? 'border-b sm:border-b-0 sm:border-r border-red-100' : ''}`}>
                <div className="flex items-center gap-1.5 text-xs font-medium text-red-700 mb-1.5">
                  <TrendingDown className="h-3.5 w-3.5" />
                  {latestDayDelta.regressionCount} regression{latestDayDelta.regressionCount !== 1 ? 's' : ''}
                </div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  {latestDayDelta.topRegressions.map(r => (
                    <button
                      key={r.name}
                      onClick={() => {
                        const op = processedData.find(o => o.operation_name === r.name);
                        if (op) setChartModalOp(op);
                      }}
                      className="font-mono text-red-700 hover:text-red-900 hover:underline cursor-pointer"
                      title="Open trend chart"
                    >
                      {r.name} <span className="text-red-600">+{r.pct.toFixed(1)}%</span>
                    </button>
                  ))}
                  {latestDayDelta.regressionCount > latestDayDelta.topRegressions.length && (
                    <span className="text-xs text-red-600/70">
                      +{latestDayDelta.regressionCount - latestDayDelta.topRegressions.length} more
                    </span>
                  )}
                </div>
              </div>
            )}
            {latestDayDelta.topImprovements.length > 0 && (
              <div className="flex-1 px-4 py-3 bg-green-50/40">
                <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 mb-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                  {latestDayDelta.improvementCount} improvement{latestDayDelta.improvementCount !== 1 ? 's' : ''}
                </div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  {latestDayDelta.topImprovements.map(i => (
                    <button
                      key={i.name}
                      onClick={() => {
                        const op = processedData.find(o => o.operation_name === i.name);
                        if (op) setChartModalOp(op);
                      }}
                      className="font-mono text-green-700 hover:text-green-900 hover:underline cursor-pointer"
                      title="Open trend chart"
                    >
                      {i.name} <span className="text-green-600">{i.pct.toFixed(1)}%</span>
                    </button>
                  ))}
                  {latestDayDelta.improvementCount > latestDayDelta.topImprovements.length && (
                    <span className="text-xs text-green-600/70">
                      +{latestDayDelta.improvementCount - latestDayDelta.topImprovements.length} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mb-6 space-y-4">
        {/* Row 1 — Title + meta + view mode toggle */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Daily Eltwise Performance Comparison</h2>
            <p className="text-sm text-gray-500">
              {filteredAndSortedData.length} operations
              {selectedCategories.length > 0 && ` (${selectedCategories.join(', ')} categories)`} • {displayedDateColumns.length}{!showAllColumns && displayedDateColumns.length < dateColumns.length ? ` of ${dateColumns.length}` : ''} days shown
              {hasMoreDays && (
                <>
                  <span className="ml-2 text-gray-700 font-medium">
                    ({currentlyLoaded} of {totalAvailable} days loaded)
                  </span>
                  {loadingAll ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-blue-600">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    <button
                      onClick={onLoadAllData}
                      className="ml-2 text-blue-600 hover:text-blue-700 underline cursor-pointer font-normal"
                    >
                      Load all {totalAvailable - currentlyLoaded} days
                    </button>
                  )}
                </>
              )}
            </p>
          </div>

          <div className={`${showMobileFilters ? 'inline-flex' : 'hidden'} md:inline-flex border border-gray-300 rounded-lg overflow-hidden h-10 shrink-0 self-start`}>
            <button
              onClick={() => handleViewModeChange('table')}
              className={`px-4 py-2 text-sm font-medium transition-all duration-300 ease-in-out border-r border-gray-300 ${
                viewMode === 'table'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Table
            </button>
            <button
              onClick={() => handleViewModeChange('chart')}
              className={`px-4 py-2 text-sm font-medium transition-all duration-300 ease-in-out ${
                viewMode === 'chart'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Charts
            </button>
          </div>
        </div>

        {/* Rows 2 & 3 — 4-column grid: Filter / Display / Actions / Sort */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1.5fr_1fr_1fr] gap-3">
          {/* Col 1 — Filter */}
          <div className="flex flex-col gap-2">
            <div className="hidden md:block text-xs font-semibold text-gray-500 uppercase tracking-wide">Filter</div>
            <div className="flex items-center gap-2">
              <div className="relative flex items-center flex-1">
                <Search className="absolute left-3 h-4 w-4 text-gray-400 pointer-events-none z-10" />
                <input
                  type="text"
                  placeholder="Search operations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full h-10"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowMobileFilters((v) => !v)}
                className="md:hidden inline-flex items-center gap-1 px-3 h-10 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 shrink-0"
                aria-expanded={showMobileFilters}
                aria-label="Toggle more options"
              >
                <Filter className="h-4 w-4" />
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showMobileFilters ? 'rotate-180' : ''}`} />
              </button>
            </div>

            <div className={`${showMobileFilters ? 'flex' : 'hidden'} md:flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white h-10`}>
              <span className="text-xs font-medium text-gray-700 whitespace-nowrap">Date Range:</span>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="text-xs border-0 focus:ring-0 p-0 h-6 flex-1 min-w-0"
                placeholder="Start"
              />
              <span className="text-gray-400">—</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="text-xs border-0 focus:ring-0 p-0 h-6 flex-1 min-w-0"
                placeholder="End"
              />
              {(dateRange.start || dateRange.end) && (
                <button
                  onClick={() => setDateRange({ start: '', end: '' })}
                  className="text-xs text-gray-500 hover:text-gray-700 shrink-0"
                  title="Clear date range"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Col 2 — Display */}
          <div className={`${showMobileFilters ? 'flex' : 'hidden'} md:flex flex-col gap-2`}>
            <div className="hidden md:block text-xs font-semibold text-gray-500 uppercase tracking-wide">Display</div>
            <div className="flex border border-gray-300 rounded-lg overflow-hidden h-10">
              {['ns', 'μs', 'ms', 's'].map((unit) => (
                <button
                  key={unit}
                  onClick={() => setSelectedUnit(unit)}
                  className={`flex-1 px-3 py-2 text-sm font-medium transition-all duration-300 ease-in-out ${
                    selectedUnit === unit
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {unit}
                </button>
              ))}
            </div>

            <div className="flex border border-gray-300 rounded-lg overflow-hidden bg-white h-10">
              <label htmlFor="showAllColumns" className="flex-1 flex items-center gap-2 px-3 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  id="showAllColumns"
                  checked={showAllColumns}
                  onChange={(e) => setShowAllColumns(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                />
                <span className="flex items-center text-sm font-medium text-gray-700 whitespace-nowrap">
                  {showAllColumns ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                  Show All Days
                </span>
                {!showAllColumns && significantColumns.length < dateColumns.length && (
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    ({dateColumns.length - significantColumns.length} hidden)
                  </span>
                )}
              </label>
              <label htmlFor="groupByCategory" className="flex-1 flex items-center gap-2 px-3 hover:bg-gray-50 cursor-pointer border-l border-gray-300 min-w-0">
                <input
                  type="checkbox"
                  id="groupByCategory"
                  checked={groupByCategory}
                  onChange={(e) => setGroupByCategory(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                />
                <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  Group by Category
                </span>
              </label>
            </div>
          </div>

          {/* Col 3 — Actions */}
          <div className={`${showMobileFilters ? 'flex' : 'hidden'} md:flex flex-col gap-2`}>
            <div className="hidden md:block text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</div>
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center justify-between w-full px-4 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 h-10"
              >
                <span className="inline-flex items-center">
                  <Filter className="h-4 w-4 mr-2" />
                  Filter Categories
                  {selectedCategories.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">
                      {selectedCategories.length}
                    </span>
                  )}
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} />
              </button>

              {showFilters && (
                <div className="absolute top-full mt-2 right-0 z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-4 min-w-96">
                  <div className="text-sm font-medium text-gray-700 mb-3">Select Operation Categories:</div>

                  <div className="space-y-4">
                    {/* Forward Operations */}
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Forward Operations</div>
                      <div className="grid grid-cols-2 gap-2">
                        {['Unary', 'Unary Inplace', 'Binary Arithmetic', 'Binary Comparison', 'Binary Logical', 'Binary Inplace', 'Ternary', 'Reduction', 'Complex'].map((category) => (
                          <label key={category} className="flex items-center space-x-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedCategories.includes(category)}
                              onChange={() => handleCategoryToggle(category)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(category)}`}>
                              {category}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Backward Operations */}
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Backward Operations</div>
                      <div className="grid grid-cols-2 gap-2">
                        {['Unary Backward', 'Binary Backward', 'Ternary Backward', 'Reduction Backward'].map((category) => (
                          <label key={category} className="flex items-center space-x-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedCategories.includes(category)}
                              onChange={() => handleCategoryToggle(category)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(category)}`}>
                              {category}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {selectedCategories.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
                      <span className="text-sm text-gray-600">{selectedCategories.length} categories selected</span>
                      <button
                        onClick={() => setSelectedCategories([])}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Clear all
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center justify-between w-full px-4 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 h-10"
                title="Export as CSV"
              >
                <span className="inline-flex items-center">
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
              </button>

              {showExportMenu && (
                <div className="absolute top-full mt-2 right-0 z-50 bg-white border border-gray-300 rounded-lg shadow-lg py-2 min-w-64">
                  <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-200">
                    Export Options
                  </div>
                  <button
                    onClick={() => exportAsCSV('current')}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span>Current View</span>
                    <span className="text-xs text-gray-500">
                      {displayedDateColumns.length} day{displayedDateColumns.length !== 1 ? 's' : ''}
                    </span>
                  </button>
                  <button
                    onClick={() => exportAsCSV('latest')}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Latest Day Only
                  </button>
                  <button
                    onClick={() => exportAsCSV('all')}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <span>All Loaded Days</span>
                      <span className="text-xs text-gray-500">
                        {allDateColumns.length} day{allDateColumns.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Ignores filters & view settings
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Col 4 — Sort */}
          <div className={`${showMobileFilters ? 'flex' : 'hidden'} md:flex flex-col gap-2`}>
            <div className="hidden md:block text-xs font-semibold text-gray-500 uppercase tracking-wide">Sort</div>
            <div className="flex border border-gray-300 rounded-lg overflow-hidden h-10">
              <button
                onClick={() => handlePerformanceSort('none')}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-all duration-300 ease-in-out flex items-center justify-center whitespace-nowrap ${
                  performanceSort === 'none'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                None
              </button>
              <button
                onClick={() => handlePerformanceSort('most-improved')}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-all duration-300 ease-in-out flex items-center justify-center whitespace-nowrap border-l border-gray-300 ${
                  performanceSort === 'most-improved'
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Improved
              </button>
              <button
                onClick={() => handlePerformanceSort('most-degraded')}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-all duration-300 ease-in-out flex items-center justify-center whitespace-nowrap border-l border-gray-300 ${
                  performanceSort === 'most-degraded'
                    ? 'bg-red-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Degraded
              </button>
            </div>
            <span className="text-xs text-gray-500">Based on latest column</span>
          </div>
        </div>
      </div>

      {/* Lower is better indicator - right above table */}
      <div className="flex justify-end mb-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-50 px-3 py-1 rounded border border-gray-200">
          <TrendingUp className="h-3.5 w-3.5 text-green-600" />
          Lower is better
        </span>
      </div>

      {viewMode === 'chart' ? (
        <div className={`space-y-6 mt-4 transition-opacity duration-150 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
          {filteredAndSortedData.map((operation) => {
            const chartData = displayedDateColumns.map(dateObj => ({
              date: dateObj.date,
              commitId: dateObj.commitId,
              value: operation.dailyPerformance[dateObj.date]?.duration_ns 
                ? convertFromNanoseconds(operation.dailyPerformance[dateObj.date].duration_ns, selectedUnit).value 
                : null
            })).filter(d => d.value !== null);

            return (
              <div key={operation.operation_name} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">{operation.operation_name}</h3>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(getOperationCategory(operation.operation_name))}`}>
                    {getOperationCategory(operation.operation_name)}
                  </span>
                </div>
                <Suspense fallback={<ChartFallback height={200} />}>
                  <TrendLineChart data={chartData} unit={selectedUnit} height={200} />
                </Suspense>
              </div>
            );
          })}
        </div>
      ) : (
        <>
        <PerformanceLegend />
        <div className={`overflow-x-auto relative transition-opacity duration-150 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`} ref={tableScrollRef} style={{ maxHeight: '70vh' }}>
          <table className="min-w-full relative" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead className="table-thead-sticky">
            <tr>
              <SortableHeader sortKey="operation_name" className="table-sticky-left-0 bg-gray-50 text-center border-r border-gray-200 px-4 z-50">
                Operation
              </SortableHeader>
              <th className="hidden md:table-cell table-header text-center table-sticky-left-180 bg-gray-50 border-r border-gray-200 px-3 z-50 whitespace-nowrap">Trend</th>
              {displayedDateColumns.map((dateObj, index) => (
                <SortableHeader key={dateObj.date} sortKey={dateObj.date} className="min-w-24 text-center">
                  <div className="flex flex-col items-center leading-tight">
                    <span title={dateObj.date}>{formatCompactDate(dateObj.date)}</span>
                    <span className="text-xs text-blue-600 font-mono">{dateObj.commitId}</span>
                    {index === displayedDateColumns.length - 1 && (
                      <span className="text-[10px] text-green-600 font-semibold">Latest</span>
                    )}
                  </div>
                </SortableHeader>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupByCategory ? (
              Object.entries(groupedData).map(([category, operations]) => (
                <React.Fragment key={category}>
                  <tr className="bg-gray-100 border-t-2 border-gray-300">
                    <td colSpan={2 + displayedDateColumns.length} className="py-2 px-4 font-semibold text-gray-700 text-left">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getCategoryColor(category)}`}>
                        {category} ({operations.length})
                      </span>
                    </td>
                  </tr>
                  {operations.map((operation, rowIdx) => (
                    <tr
                      key={operation.operation_name}
                      className={`${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50 transition-colors duration-150 group h-14`}
                    >
                      <td className="table-cell-sticky table-sticky-left-0 bg-white group-hover:bg-blue-50 border-r border-gray-200 transition-colors duration-150 py-1 px-3">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-medium text-gray-900 text-sm truncate max-w-full">{operation.operation_name}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getCategoryColor(getOperationCategory(operation.operation_name))}`}>
                            {getOperationCategory(operation.operation_name)}
                          </span>
                        </div>
                      </td>
                      <td
                        className="hidden md:table-cell table-cell-sticky table-sticky-left-180 bg-white group-hover:bg-blue-50 border-r border-gray-200 transition-colors duration-150 py-1 px-2 cursor-zoom-in"
                        onClick={() => setChartModalOp(operation)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChartModalOp(operation); } }}
                        title="Click to enlarge trend"
                      >
                        <div className="flex items-center justify-center">
                          <RowSparkline values={displayedDateColumns.map(d => operation.dailyPerformance[d.date]?.duration_ns).filter(v => v != null)} />
                        </div>
                      </td>
                      {displayedDateColumns.map((dateObj, dateIndex) => {
                        const dayData = operation.dailyPerformance[dateObj.date];
                        const previousDateObj = dateIndex > 0 ? displayedDateColumns[dateIndex - 1] : null;
                        const previousData = previousDateObj ? operation.dailyPerformance[previousDateObj.date] : null;
                        const change = getPerformanceChange(dayData, previousData);
                        
                        const previousValue = previousData?.duration_ns;
                        const isFirstColumn = dateIndex === 0;
                        const colorClass = dayData ? getPerformanceColor(dayData.duration_ns, previousValue, isFirstColumn) : '';

                        return (
                          <td key={dateObj.date} className="table-cell text-center relative py-1">
                            {dayData ? (
                              <div className="flex flex-col items-center">
                                <span className={`performance-cell ${colorClass}`}>
                                  {formatValue(dayData.duration_ns, selectedUnit)}{selectedUnit}
                                </span>
                                {change && change.trend !== 'stable' && (
                                  <div className={`flex items-center text-xs ${
                                    change.trend === 'better' ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {change.trend === 'better' ? (
                                      <TrendingUp className="h-3 w-3 mr-1" />
                                    ) : (
                                      <TrendingDown className="h-3 w-3 mr-1" />
                                    )}
                                    {Math.abs(parseFloat(change.percentage))}%
                                  </div>
                                )}
                                {change && change.trend === 'stable' && (
                                  <div className="flex items-center text-xs text-gray-400">
                                    <Minus className="h-3 w-3" />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-sm">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))
            ) : (
              filteredAndSortedData.map((operation, index) => (
                <tr
                  key={operation.operation_name}
                  className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50 transition-colors duration-150 group h-14`}
                >
                  <td className="table-cell-sticky table-sticky-left-0 bg-white group-hover:bg-blue-50 border-r border-gray-200 transition-colors duration-150 py-1 px-3">
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-medium text-gray-900 text-sm truncate max-w-full">{operation.operation_name}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getCategoryColor(getOperationCategory(operation.operation_name))}`}>
                        {getOperationCategory(operation.operation_name)}
                      </span>
                    </div>
                  </td>
                  <td
                    className="hidden md:table-cell table-cell-sticky table-sticky-left-180 bg-white group-hover:bg-blue-50 border-r border-gray-200 transition-colors duration-150 py-1 px-2 cursor-zoom-in"
                    onClick={() => setChartModalOp(operation)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChartModalOp(operation); } }}
                    title="Click to enlarge trend"
                  >
                    <div className="flex items-center justify-center">
                      <RowSparkline values={displayedDateColumns.map(d => operation.dailyPerformance[d.date]?.duration_ns).filter(v => v != null)} />
                    </div>
                  </td>
                {displayedDateColumns.map((dateObj, dateIndex) => {
                   const dayData = operation.dailyPerformance[dateObj.date];
                   const previousDateObj = dateIndex > 0 ? displayedDateColumns[dateIndex - 1] : null;
                   const previousData = previousDateObj ? operation.dailyPerformance[previousDateObj.date] : null;
                   const change = getPerformanceChange(dayData, previousData);
                   
                   // Get previous day value for comparison
                   const previousValue = previousData?.duration_ns;
                   
                   const isFirstColumn = dateIndex === 0;
                   const colorClass = dayData ? getPerformanceColor(dayData.duration_ns, previousValue, isFirstColumn) : '';

                   return (
                     <td key={dateObj.date} className="table-cell text-center relative py-1">
                       {dayData ? (
                         <div className="flex flex-col items-center">
                           <span className={`performance-cell ${colorClass}`}>
                             {formatValue(dayData.duration_ns, selectedUnit)}{selectedUnit}
                           </span>
                           
                           {/* Show day-to-day trend arrow */}
                           {change && change.trend !== 'stable' && (
                             <div className={`flex items-center text-xs ${
                               change.trend === 'better' ? 'text-green-600' : 'text-red-600'
                             }`}>
                               {change.trend === 'better' ? (
                                 <TrendingUp className="h-3 w-3 mr-1" />
                               ) : (
                                 <TrendingDown className="h-3 w-3 mr-1" />
                               )}
                               {Math.abs(parseFloat(change.percentage))}%
                             </div>
                           )}
                           {change && change.trend === 'stable' && (
                             <div className="flex items-center text-xs text-gray-400">
                               <Minus className="h-3 w-3" />
                             </div>
                           )}
                         </div>
                       ) : (
                         <span className="text-gray-400 text-sm">—</span>
                       )}
                     </td>
                   );
                 })}
               </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
        </>
      )}

      {filteredAndSortedData.length === 0 && viewMode === 'table' && (
        <div className="text-center py-8">
          <Search className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500">No operations match your search criteria.</p>
        </div>
      )}

       <div className="mt-4 border-t pt-4 space-y-3">
         <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-gray-500">
           <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
             <div className="flex items-center">
               <TrendingUp className="h-3 w-3 text-green-600 mr-1" />
               <span>Performance improved ({'>'}5% faster)</span>
             </div>
             <div className="flex items-center">
               <TrendingDown className="h-3 w-3 text-red-600 mr-1" />
               <span>Performance degraded ({'>'}5% slower)</span>
             </div>
             <div className="flex items-center">
               <Minus className="h-3 w-3 text-gray-400 mr-1" />
               <span>Stable (±5%)</span>
             </div>
           </div>
           <div>
             All times shown in {selectedUnit === 'μs' ? 'microseconds' : selectedUnit === 'ns' ? 'nanoseconds' : selectedUnit === 'ms' ? 'milliseconds' : 'seconds'} • Click column headers to sort by values • Use Performance Sort for trend analysis • Filter by category
           </div>
         </div>
         
         <div className="flex flex-wrap items-center gap-y-2 text-xs text-gray-500">
           <span className="mr-3">Performance colors (relative to previous day):</span>
           <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
             <div className="flex items-center">
               <div className="w-4 h-3 bg-green-200 rounded mr-1"></div>
               <span>{'>'}15% faster</span>
             </div>
             <div className="flex items-center">
               <div className="w-4 h-3 bg-green-100 rounded mr-1"></div>
               <span>8-15% faster</span>
             </div>
             <div className="flex items-center">
               <div className="w-4 h-3 bg-green-50 rounded mr-1"></div>
               <span>3-8% faster</span>
             </div>
             <div className="flex items-center">
               <div className="w-4 h-3 bg-white border border-gray-200 rounded mr-1"></div>
               <span>±3% (stable)</span>
             </div>
             <div className="flex items-center">
               <div className="w-4 h-3 bg-red-50 rounded mr-1"></div>
               <span>3-8% slower</span>
             </div>
             <div className="flex items-center">
               <div className="w-4 h-3 bg-red-100 rounded mr-1"></div>
               <span>8-15% slower</span>
             </div>
             <div className="flex items-center">
               <div className="w-4 h-3 bg-red-200 rounded mr-1"></div>
               <span>{'>'}15% slower</span>
             </div>
           </div>
         </div>
         
         <div className="space-y-2 text-xs text-gray-500">
           <div className="flex items-center">
             <span className="mr-3 font-medium">Forward Operations:</span>
             <div className="flex flex-wrap items-center gap-2">
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-blue-100 rounded mr-1"></div>
                 <span>Unary</span>
               </div>
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-green-100 rounded mr-1"></div>
                 <span>Binary Arith</span>
               </div>
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-green-200 rounded mr-1"></div>
                 <span>Binary Comp</span>
               </div>
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-green-300 rounded mr-1"></div>
                 <span>Binary Logic</span>
               </div>
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-purple-100 rounded mr-1"></div>
                 <span>Ternary</span>
               </div>
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-orange-100 rounded mr-1"></div>
                 <span>Reduction</span>
               </div>
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-pink-100 rounded mr-1"></div>
                 <span>Complex</span>
               </div>
             </div>
           </div>
           <div className="flex items-center">
             <span className="mr-3 font-medium">Backward Operations:</span>
             <div className="flex flex-wrap items-center gap-2">
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-gray-100 rounded mr-1"></div>
                 <span>Unary BW</span>
               </div>
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-gray-200 rounded mr-1"></div>
                 <span>Binary BW</span>
               </div>
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-gray-300 rounded mr-1"></div>
                 <span>Ternary BW</span>
               </div>
               <div className="flex items-center">
                 <div className="w-3 h-3 bg-gray-400 rounded mr-1"></div>
                 <span>Reduction BW</span>
               </div>
             </div>
           </div>
         </div>
       </div>

       {chartModalOp && (() => {
         const modalChartData = displayedDateColumns.map(dateObj => ({
           date: dateObj.date,
           commitId: dateObj.commitId,
           value: chartModalOp.dailyPerformance[dateObj.date]?.duration_ns
             ? convertFromNanoseconds(chartModalOp.dailyPerformance[dateObj.date].duration_ns, selectedUnit).value
             : null,
         })).filter(d => d.value !== null);

         return (
           <div
             className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={() => setChartModalOp(null)}
             role="dialog"
             aria-modal="true"
             aria-label={`${chartModalOp.operation_name} performance trend`}
           >
             <div
               className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
               onClick={(e) => e.stopPropagation()}
             >
               <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                 <div className="flex items-center gap-3 min-w-0">
                   <h3 className="text-lg font-semibold text-gray-900 truncate">{chartModalOp.operation_name}</h3>
                   <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${getCategoryColor(getOperationCategory(chartModalOp.operation_name))}`}>
                     {getOperationCategory(chartModalOp.operation_name)}
                   </span>
                 </div>
                 <button
                   onClick={() => setChartModalOp(null)}
                   className="text-gray-400 hover:text-gray-600 transition-colors shrink-0 ml-3"
                   aria-label="Close chart"
                 >
                   <X className="h-5 w-5" />
                 </button>
               </div>
               <div className="p-6 flex-1 overflow-auto">
                 {modalChartData.length >= 2 ? (
                   <Suspense fallback={<ChartFallback height={400} />}>
                     <TrendLineChart data={modalChartData} unit={selectedUnit} height={400} />
                   </Suspense>
                 ) : (
                   <div className="h-[400px] flex items-center justify-center text-sm text-gray-500">
                     Not enough data points to chart this operation.
                   </div>
                 )}
               </div>
             </div>
           </div>
         );
       })()}
     </div>
   );
 };

 export default PerformanceTable;