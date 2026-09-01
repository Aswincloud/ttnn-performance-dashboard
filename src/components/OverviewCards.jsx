import React, { useState } from 'react';
import { GitBranch, Zap, Activity, Cpu, Settings, Database, Info, Copy, Check, ExternalLink } from 'lucide-react';

// git_commit_id is the tt-metal commit that was benchmarked — perf_measurement_script.py
// runs `git rev-parse HEAD` from the tt-metal checkout (TT_METAL_HOME), not this repo.
// So the commit link must point at the tt-metal repo, where the SHA actually resolves.
const COMMIT_BASE_URL = 'https://github.com/tenstorrent/tt-metal/commit/';

// Show the measurement date as an unambiguous YYYY-MM-DD by slicing it straight
// from the ISO string (e.g. "2026-06-21T02:03:44.546584" -> "2026-06-21").
// Avoids locale-specific formats like 6/21/2026, and stays correct even if the
// field ever becomes date-only (where `new Date(...)` would parse as UTC
// midnight and could render a day earlier for western viewers).
function formatDateKey(isoString) {
  if (typeof isoString !== 'string') return '';
  return isoString.slice(0, 10);
}

// Every combo runs on N150 now, so the device is a constant rather than a map.
// Shape and dtype are read from the combo key `<dtype>_<shape>`, which is the
// same key the index and the data directories use.
//
// NOTE: take the dtype/shape from the LAST underscore-separated segments rather
// than by fixed position — an unknown key used to fall back silently to
// "N150 / [1,1,32,32]", so a key format change rendered a confidently WRONG
// banner with no error. Anything unrecognised now renders the raw segment.
const DEVICE_LABEL = 'Wormhole N150';
const SHAPE_LABEL = { '32x32': '[1, 1, 32, 32]', '256x256': '[1, 1, 256, 256]' };
const DTYPE_LABEL = { bf16: 'BFLOAT16', fp32: 'FLOAT32' };

const TestConfigBanner = ({ summaryStats, combo = 'bf16_32x32', comboCount = 1 }) => {
  const [copied, setCopied] = useState(false);
  const [dtypeKey, shapeKey] = String(combo).split('_');
  const deviceLabel = DEVICE_LABEL;
  const shapeLabel = SHAPE_LABEL[shapeKey] || shapeKey;
  const dtypeLabel = DTYPE_LABEL[dtypeKey] || String(dtypeKey).toUpperCase();
  // In multi-combo mode the banner reflects the PRIMARY combo; a hint tells the
  // reader the table below is showing several combos side by side.
  const multi = comboCount > 1;

  const copyCommit = async (sha) => {
    try {
      await navigator.clipboard.writeText(sha);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (insecure context / permissions). Fail quietly —
      // the commit is still visible and the link still works.
    }
  };

  return (
    <div className="glass-card mb-8 border-l-4 border-blue-500">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <div className="bg-blue-100 dark:bg-blue-900/40 p-2 rounded-lg">
            <Info className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Test Configuration</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {multi
                ? `Primary combo · ${comboCount} combos compared in the table`
                : 'Hardware and test parameters'}
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 w-full md:w-auto md:flex md:items-center md:gap-6 md:flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Cpu className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400">Device</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{deviceLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <Settings className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400">Shape</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 font-mono truncate">{shapeLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <Zap className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400">Data Type</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 font-mono truncate">{dtypeLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <Database className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400">Memory Config</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">DRAM</p>
            </div>
          </div>

          {summaryStats && (
            <>
              <div className="hidden md:block h-8 w-px bg-gray-300 dark:bg-slate-600"></div>

              <div className="flex items-center gap-2 min-w-0">
                <Activity className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total Operations</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{summaryStats.totalOperations}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 min-w-0">
                <GitBranch className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Latest Commit</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 font-mono flex items-center gap-1.5">
                    {summaryStats.gitCommitFull ? (
                      <>
                        <a
                          href={COMMIT_BASE_URL + summaryStats.gitCommitFull}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                          title="View this commit on GitHub"
                        >
                          {summaryStats.gitCommit}
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                        <button
                          type="button"
                          onClick={() => copyCommit(summaryStats.gitCommitFull)}
                          className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                          title="Copy full commit SHA"
                          aria-label={copied ? 'Commit SHA copied' : 'Copy full commit SHA'}
                        >
                          {copied ? (
                            <Check className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                        </button>
                      </>
                    ) : (
                      <span className="text-gray-900 dark:text-gray-100">{summaryStats.gitCommit}</span>
                    )}
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      ({formatDateKey(summaryStats.lastUpdated)})
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

const OverviewCards = ({ summaryStats, combo, comboCount = 1 }) => {
  return <TestConfigBanner summaryStats={summaryStats} combo={combo} comboCount={comboCount} />;
};

export default OverviewCards; 