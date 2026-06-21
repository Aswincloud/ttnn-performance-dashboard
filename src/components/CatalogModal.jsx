import React, { useEffect, useState } from 'react';
import { X, Search, Book, Zap, Code, Filter } from 'lucide-react';
import { operationsCatalog } from '../utils/operationsCatalog';

const CATEGORY_PRESENTATION = {
  unary:     { name: 'Unary Operations',     color: 'from-blue-500 to-indigo-600',  description: 'Single-input mathematical and logical operations' },
  binary:    { name: 'Binary Operations',    color: 'from-green-500 to-emerald-600', description: 'Two-input arithmetic, comparison, and logical operations' },
  ternary:   { name: 'Ternary Operations',   color: 'from-purple-500 to-violet-600', description: 'Three-input conditional and mathematical operations' },
  reduction: { name: 'Reduction Operations', color: 'from-orange-500 to-red-600',    description: 'Operations that reduce tensor dimensions' },
  backward:  { name: 'Backward Operations',  color: 'from-gray-500 to-slate-600',    description: 'Gradient computation operations for training' },
  complex:   { name: 'Complex Operations',   color: 'from-pink-500 to-rose-600',     description: 'Complex number mathematical operations' },
};

const flattenCategoryOperations = (category) =>
  category.operations
    ? category.operations
    : Object.values(category.subcategories ?? {}).flatMap((sub) => sub.operations ?? []);

const parseCoveragePercent = (raw) => {
  const match = typeof raw === 'string' ? raw.match(/(\d+(?:\.\d+)?)\s*%/) : null;
  return match ? parseFloat(match[1]) : null;
};

const buildCatalogData = () => ({
  summary: {
    totalCategories: operationsCatalog.metadata.total_categories,
    totalOperations: operationsCatalog.metadata.total_operations,
    testCoverage: parseCoveragePercent(operationsCatalog.metadata.test_coverage),
  },
  categories: Object.fromEntries(
    Object.entries(operationsCatalog.categories).map(([key, category]) => {
      const presentation = CATEGORY_PRESENTATION[key] ?? {};
      return [
        key,
        {
          name: presentation.name ?? key,
          count: category.total_count,
          description: presentation.description ?? category.description,
          color: presentation.color ?? 'from-gray-500 to-slate-600',
          operations: flattenCategoryOperations(category),
        },
      ];
    }),
  ),
  highPriority: operationsCatalog.priority_classification.high_priority.operations,
});

const catalogData = buildCatalogData();

const CatalogModal = ({ isOpen, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredCategories = Object.entries(catalogData.categories).filter(([key, category]) => {
    if (selectedCategory !== 'all' && key !== selectedCategory) return false;
    if (!searchTerm) return true;
    
    return category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           category.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
           category.operations.some(op => op.toLowerCase().includes(searchTerm.toLowerCase()));
  });

  const filteredOperations = (operations) => {
    if (!searchTerm) return operations;
    return operations.filter(op => op.toLowerCase().includes(searchTerm.toLowerCase()));
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="glass-card max-w-6xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-600 rounded-xl blur-lg opacity-30"></div>
              <div className="relative bg-gradient-to-br from-blue-500 to-indigo-600 p-3 rounded-xl">
                <Book className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="ml-4">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                TTNN Operations Catalog
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                {catalogData.summary.totalOperations} operations • {catalogData.summary.testCoverage}% test coverage
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors duration-200"
          >
            <X className="h-6 w-6 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6 flex-shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none z-10" />
            <input
              type="text"
              placeholder="Search operations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm w-full"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="pl-10 pr-8 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm appearance-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            >
              <option value="all">All Categories</option>
              {Object.entries(catalogData.categories).map(([key, category]) => (
                <option key={key} value={key}>{category.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Content - Flexible height that takes remaining space */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredCategories.map(([key, category]) => {
              const filtered = filteredOperations(category.operations);
              if (filtered.length === 0 && searchTerm) return null;
              
              return (
                <div key={key} className="card hover:shadow-lg transition-all duration-300">
                  <div className="flex items-center mb-4">
                    <div className={`w-4 h-4 rounded-full bg-gradient-to-r ${category.color} mr-3`}></div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{category.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{category.count} operations</p>
                    </div>
                  </div>
                  
                  <p className="text-gray-600 dark:text-gray-300 mb-4">{category.description}</p>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Operations:</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{filtered.length} shown</span>
                    </div>
                    
                    <div className="bg-gray-50 dark:bg-slate-900/50 rounded-lg p-3 max-h-60 overflow-y-auto">
                      <div className="flex flex-wrap gap-1">
                        {filtered.map((operation) => (
                          <span
                            key={operation}
                            className={`inline-flex items-center px-2 py-1 rounded text-xs font-mono transition-colors duration-200 ${
                              catalogData.highPriority.includes(operation)
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-200'
                            }`}
                          >
                            {catalogData.highPriority.includes(operation) && (
                              <Zap className="h-3 w-3 mr-1" />
                            )}
                            {operation}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer - Always visible at bottom */}
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-slate-700 text-center flex-shrink-0">
          <div className="flex items-center justify-center space-x-6 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center">
              <Zap className="h-4 w-4 mr-1 text-blue-500" />
              <span>High Priority Operations</span>
            </div>
            <div className="flex items-center">
              <Code className="h-4 w-4 mr-1 text-gray-400" />
              <span>{catalogData.summary.testCoverage}% Test Coverage</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CatalogModal; 