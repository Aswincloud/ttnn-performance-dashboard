import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronUp, ChevronDown, Filter, BarChart3, TrendingUp, TrendingDown, Minus, Eye, EyeOff, Loader2, Download } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { operationsCatalog } from '../utils/operationsCatalog.js';

const PerformanceTable = ({ operations, dailyData, loadingAll, onLoadAllData, hasMoreDays, totalAvailable, currentlyLoaded }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'operation_name', direction: 'asc' });
  const [selectedUnit, setSelectedUnit] = useState('ns');
  const [performanceSort, setPerformanceSort] = useState('none');
  const [selectedCategories, setSelectedCategories] = useState([
    'Unary', 'Binary Arithmetic', 'Binary Comparison', 'Binary Logical', 
    'Ternary', 'Reduction', 'Complex'
  ]);
  const [showFilters, setShowFilters] = useState(false);
  const [showAllColumns, setShowAllColumns] = useState(true);
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'chart'
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [showExportMenu, setShowExportMenu] = useState(false);
  const filterRef = useRef(null);
  const tableScrollRef = useRef(null);
  const exportRef = useRef(null);

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



  const getOperationSubcategory = (operationName) => {
    const name = operationName.toLowerCase();
    const categories = operationsCatalog.categories;
    
    // Check each main category's subcategories
    for (const [mainCat, catData] of Object.entries(categories)) {
      if (catData.subcategories) {
        for (const [subCatKey, subCatData] of Object.entries(catData.subcategories)) {
          if (subCatData.operations && subCatData.operations.includes(name)) {
            return {
              main: mainCat,
              sub: subCatKey,
              description: subCatData.description
            };
          }
        }
      } else if (catData.operations && catData.operations.includes(name)) {
        return {
          main: mainCat,
          sub: null,
          description: catData.description
        };
      }
    }
    return null;
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

  // Group data by category
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Daily Eltwise Performance Comparison</h2>
          <div className="flex items-center gap-3">
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
          
          {/* View Mode Toggle */}
          <div className="inline-flex border border-gray-300 rounded-lg overflow-hidden h-10">
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
        
        <div className="flex flex-col lg:flex-row gap-3 mt-4 sm:mt-0">
          {/* Search Input */}
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-gray-400 pointer-events-none z-10" />
            <input
              type="text"
              placeholder="Search operations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-64 h-10"
            />
          </div>
          
          {/* Controls Row */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Unit Selector */}
            <div className="flex border border-gray-300 rounded-lg overflow-hidden">
              {['ns', 'μs', 'ms', 's'].map((unit) => (
                <button
                  key={unit}
                  onClick={() => setSelectedUnit(unit)}
                  className={`px-3 py-2 text-sm font-medium transition-all duration-300 ease-in-out h-10 ${
                    selectedUnit === unit
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {unit}
                </button>
              ))}
            </div>
            
            {/* Show All Columns Toggle */}
            <div className="flex items-center space-x-2 px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 h-10">
              <input
                type="checkbox"
                id="showAllColumns"
                checked={showAllColumns}
                onChange={(e) => setShowAllColumns(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="showAllColumns" className="flex items-center text-sm font-medium text-gray-700 cursor-pointer whitespace-nowrap">
                {showAllColumns ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                Show All Days
              </label>
              {!showAllColumns && significantColumns.length < dateColumns.length && (
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  ({dateColumns.length - significantColumns.length} hidden)
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg bg-white h-10">
              <input
                type="checkbox"
                id="groupByCategory"
                checked={groupByCategory}
                onChange={(e) => setGroupByCategory(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="groupByCategory" className="flex items-center text-sm font-medium text-gray-700 cursor-pointer whitespace-nowrap">
                Group by Category
              </label>
            </div>
            
            {/* Filter Dropdown */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center px-4 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 h-10"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filter Categories
                {selectedCategories.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">
                    {selectedCategories.length}
                  </span>
                )}
                <ChevronDown className={`h-4 w-4 ml-2 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} />
              </button>
              
              {showFilters && (
                <div className="absolute top-full mt-2 left-0 z-10 bg-white border border-gray-300 rounded-lg shadow-lg p-4 min-w-96">
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
            
            {/* Export Dropdown */}
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center px-4 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 h-10"
                title="Export as CSV"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
                <ChevronDown className={`h-4 w-4 ml-2 transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
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
            
            {/* Date Range Filter */}
            <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white h-10">
              <span className="text-xs font-medium text-gray-700 whitespace-nowrap">Date Range:</span>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="text-xs border-0 focus:ring-0 p-0 h-6 w-28"
                placeholder="Start"
              />
              <span className="text-gray-400">—</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="text-xs border-0 focus:ring-0 p-0 h-6 w-28"
                placeholder="End"
              />
              {(dateRange.start || dateRange.end) && (
                <button
                  onClick={() => setDateRange({ start: '', end: '' })}
                  className="text-xs text-gray-500 hover:text-gray-700"
                  title="Clear date range"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
        
        {/* Performance Sort Section (separate row) */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center mt-3">
          <div className="flex flex-col gap-2 w-full">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-700">Performance Sort</span>
                <span className="text-xs text-gray-500">(based on latest column)</span>
              </div>
              <div className="flex border border-gray-300 rounded-lg">
                <button
                  onClick={() => handlePerformanceSort('none')}
                  className={`px-5 py-2 text-sm font-medium transition-all duration-300 ease-in-out flex items-center justify-center whitespace-nowrap rounded-l-lg ${
                    performanceSort === 'none'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  None
                </button>
                <button
                  onClick={() => handlePerformanceSort('most-improved')}
                  className={`px-5 py-2 text-sm font-medium transition-all duration-300 ease-in-out flex items-center justify-center whitespace-nowrap border-l border-gray-300 ${
                    performanceSort === 'most-improved'
                      ? 'bg-green-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Improved
                </button>
                <button
                  onClick={() => handlePerformanceSort('most-degraded')}
                  className={`px-5 py-2 text-sm font-medium transition-all duration-300 ease-in-out flex items-center justify-center whitespace-nowrap border-l border-gray-300 rounded-r-lg ${
                    performanceSort === 'most-degraded'
                      ? 'bg-red-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Degraded
                </button>
              </div>
            </div>
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
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} label={{ value: selectedUnit, angle: -90, position: 'insideLeft' }} />
                    <Tooltip 
                      formatter={(value) => [`${value.toFixed(3)} ${selectedUnit}`, 'Performance']}
                      labelFormatter={(label) => {
                        const dataPoint = chartData.find(d => d.date === label);
                        return `${label} (${dataPoint?.commitId || 'N/A'})`;
                      }}
                    />
                    <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`overflow-x-auto relative transition-opacity duration-150 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`} ref={tableScrollRef} style={{ maxHeight: '70vh' }}>
          <table className="min-w-full relative" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead className="table-thead-sticky">
            <tr>
              <SortableHeader sortKey="operation_name" className="table-sticky-left-0 bg-gray-50 text-center border-r border-gray-200 px-4 z-50">
                Operation
              </SortableHeader>
              <th className="table-header text-center table-sticky-left-160 bg-gray-50 border-r border-gray-200 px-4 z-50">Category</th>
              {displayedDateColumns.map((dateObj, index) => (
                <SortableHeader key={dateObj.date} sortKey={dateObj.date} className="min-w-32 text-center">
                  <div className="flex flex-col items-center">
                    <span>{dateObj.date}</span>
                    <span className="text-xs text-blue-600 font-mono">{dateObj.commitId}</span>
                    {index === displayedDateColumns.length - 1 && (
                      <span className="text-xs text-green-600 font-semibold">Latest</span>
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
                      className={`${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50 transition-colors duration-150 group h-10`}
                    >
                      <td className="table-cell-sticky table-sticky-left-0 bg-white group-hover:bg-blue-50 font-medium text-gray-900 border-r border-gray-200 text-center transition-colors duration-150 py-1">
                        {operation.operation_name}
                      </td>
                      <td className="table-cell-sticky text-center table-sticky-left-160 bg-white group-hover:bg-blue-50 border-r border-gray-200 transition-colors duration-150 py-1">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(getOperationCategory(operation.operation_name))}`}>
                          {getOperationCategory(operation.operation_name)}
                        </span>
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
                  className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-blue-50 transition-colors duration-150 group h-10`}
                >
                  <td className="table-cell-sticky table-sticky-left-0 bg-white group-hover:bg-blue-50 font-medium text-gray-900 border-r border-gray-200 text-center transition-colors duration-150 py-1">
                    {operation.operation_name}
                  </td>
                  <td className="table-cell-sticky text-center table-sticky-left-160 bg-white group-hover:bg-blue-50 border-r border-gray-200 transition-colors duration-150 py-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(getOperationCategory(operation.operation_name))}`}>
                      {getOperationCategory(operation.operation_name)}
                    </span>
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
      )}

      {filteredAndSortedData.length === 0 && viewMode === 'table' && (
        <div className="text-center py-8">
          <Search className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500">No operations match your search criteria.</p>
        </div>
      )}

       <div className="mt-4 border-t pt-4 space-y-3">
         <div className="flex items-center justify-between text-xs text-gray-500">
           <div className="flex items-center space-x-4">
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
         
         <div className="flex items-center text-xs text-gray-500">
           <span className="mr-3">Performance colors (relative to previous day):</span>
           <div className="flex items-center space-x-2">
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
     </div>
   );
 };

 export default PerformanceTable;