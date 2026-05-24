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
        
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-gray-500" />
            <div>
              <p className="text-xs text-gray-500">Device</p>
              <p className="text-sm font-semibold text-gray-900">Wormhole N150</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-gray-500" />
            <div>
              <p className="text-xs text-gray-500">Shape</p>
              <p className="text-sm font-semibold text-gray-900 font-mono">[1, 1, 32, 32]</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-gray-500" />
            <div>
              <p className="text-xs text-gray-500">Data Type</p>
              <p className="text-sm font-semibold text-gray-900 font-mono">BFLOAT16</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-gray-500" />
            <div>
              <p className="text-xs text-gray-500">Memory Config</p>
              <p className="text-sm font-semibold text-gray-900">DRAM</p>
            </div>
          </div>

          {summaryStats && (
            <>
              <div className="h-8 w-px bg-gray-300"></div>
              
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-500">Total Operations</p>
                  <p className="text-sm font-semibold text-gray-900">{summaryStats.totalOperations}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-500">Latest Commit</p>
                  <p className="text-sm font-semibold text-gray-900 font-mono">
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