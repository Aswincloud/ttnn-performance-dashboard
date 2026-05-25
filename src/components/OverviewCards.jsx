import React from 'react';
import { GitBranch, Zap, Activity, Cpu, Settings, Database, Info } from 'lucide-react';

const TestConfigBanner = ({ summaryStats }) => {
  return (
    <div className="glass-card mb-8 border-l-4 border-blue-500">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <div className="bg-blue-100 p-2 rounded-lg">
            <Info className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Test Configuration</h3>
            <p className="text-xs text-gray-500">Hardware and test parameters</p>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-x-3 gap-y-3 w-full md:w-auto md:flex md:items-center md:gap-6 md:flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Cpu className="h-4 w-4 text-gray-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-gray-500">Device</p>
              <p className="text-sm font-semibold text-gray-900 truncate">Wormhole N150</p>
            </div>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <Settings className="h-4 w-4 text-gray-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-gray-500">Shape</p>
              <p className="text-sm font-semibold text-gray-900 font-mono truncate">[1, 1, 32, 32]</p>
            </div>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <Zap className="h-4 w-4 text-gray-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-gray-500">Data Type</p>
              <p className="text-sm font-semibold text-gray-900 font-mono truncate">BFLOAT16</p>
            </div>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <Database className="h-4 w-4 text-gray-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-gray-500">Memory Config</p>
              <p className="text-sm font-semibold text-gray-900 truncate">DRAM</p>
            </div>
          </div>

          {summaryStats && (
            <>
              <div className="hidden md:block h-8 w-px bg-gray-300"></div>

              <div className="flex items-center gap-2 min-w-0">
                <Activity className="h-4 w-4 text-gray-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Total Operations</p>
                  <p className="text-sm font-semibold text-gray-900 truncate">{summaryStats.totalOperations}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 min-w-0">
                <GitBranch className="h-4 w-4 text-gray-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Latest Commit</p>
                  <p className="text-sm font-semibold text-gray-900 font-mono truncate">
                    {summaryStats.gitCommit}
                    <span className="text-xs text-gray-500 ml-1">
                      ({new Date(summaryStats.lastUpdated).toLocaleDateString()})
                    </span>
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const OverviewCards = ({ summaryStats }) => {
  return <TestConfigBanner summaryStats={summaryStats} />;
};

export default OverviewCards; 