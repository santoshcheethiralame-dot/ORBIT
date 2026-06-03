/**
 * StressTestView.tsx — Developer diagnostic panel.
 * Runs a suite of DB integrity, performance, and algorithm checks.
 */

import React, { useState, useCallback } from 'react';
import { db } from './db';
import { getAllReadinessScores } from './brain-ultimate';
import { getISTEffectiveDate } from './utils/time';
import { getApiKey } from './gemini';
import {
  CheckCircle2, XCircle, Loader2, Play, RefreshCw, Database,
  Brain, Clock, Zap,
} from 'lucide-react';
import { FrostedTile, FrostedMini } from './components';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'running';
  detail: string;
  ms?: number;
}

const tests: Array<{
  name: string;
  icon: React.ElementType;
  run: () => Promise<{ ok: boolean; detail: string }>;
}> = [
  {
    name: 'IndexedDB read',
    icon: Database,
    run: async () => {
      const count = await db.subjects.count();
      return { ok: true, detail: `${count} subjects found` };
    },
  },
  {
    name: 'IndexedDB write',
    icon: Database,
    run: async () => {
      const key = '__stress_test__';
      await db.settings.put({ key, weeklyTargetHours: 7 });
      const row = await db.settings.get(key);
      await db.settings.delete(key);
      return {
        ok: !!row,
        detail: row ? 'Write/read/delete cycle OK' : 'Write succeeded but read returned null',
      };
    },
  },
  {
    name: 'Readiness calculation',
    icon: Brain,
    run: async () => {
      const scores = await getAllReadinessScores();
      const entries = Object.entries(scores);
      return {
        ok: true,
        detail: `${entries.length} subjects computed; avg ${
          entries.length
            ? Math.round(entries.reduce((s, [, r]) => s + r.score, 0) / entries.length)
            : 0
        }%`,
      };
    },
  },
  {
    name: 'Effective date',
    icon: Clock,
    run: async () => {
      const d = getISTEffectiveDate();
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(d);
      return { ok: valid, detail: valid ? `Effective date: ${d}` : `Invalid format: ${d}` };
    },
  },
  {
    name: 'AI API reachable',
    icon: Zap,
    run: async () => {
      const key = getApiKey();
      if (!key) return { ok: false, detail: 'No API key set — add one in Settings → AI Assistant' };
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      return {
        ok: res.ok,
        detail: res.ok ? `HTTP ${res.status} — API reachable` : `HTTP ${res.status}`,
      };
    },
  },
  {
    name: 'localStorage quota',
    icon: Database,
    run: async () => {
      const used = Object.keys(localStorage).reduce(
        (s, k) => s + (localStorage.getItem(k)?.length ?? 0),
        0,
      );
      const kb = Math.round(used / 1024);
      return {
        ok: kb < 4096,
        detail: `~${kb} KB used (5120 KB limit)${kb >= 4096 ? ' — NEAR LIMIT' : ''}`,
      };
    },
  },
  {
    name: 'Plans table integrity',
    icon: Database,
    run: async () => {
      const plans = await db.plans.toArray();
      const corrupt = plans.filter(p => !p.date || !Array.isArray(p.blocks));
      return {
        ok: corrupt.length === 0,
        detail:
          corrupt.length === 0
            ? `${plans.length} plans — all valid`
            : `${corrupt.length} corrupt plan(s) found`,
      };
    },
  },
];

export interface StressTestViewProps {
  onBack?: () => void;
}

const StatusIcon: React.FC<{ status: TestResult['status'] }> = ({ status }) => {
  if (status === 'pass')    return <CheckCircle2 size={16} className="text-emerald-400" />;
  if (status === 'fail')    return <XCircle size={16} className="text-red-400" />;
  if (status === 'warn')    return <XCircle size={16} className="text-amber-400" />;
  return <Loader2 size={16} className="text-indigo-400 animate-spin" />;
};

export default function StressTestView({ onBack }: StressTestViewProps) {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setResults(tests.map(t => ({ name: t.name, status: 'running', detail: '…' })));

    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      const start = performance.now();
      try {
        const { ok, detail } = await t.run();
        const ms = Math.round(performance.now() - start);
        setResults(prev => {
          const next = [...prev];
          next[i] = { name: t.name, status: ok ? 'pass' : 'fail', detail, ms };
          return next;
        });
      } catch (err: any) {
        const ms = Math.round(performance.now() - start);
        setResults(prev => {
          const next = [...prev];
          next[i] = {
            name: t.name,
            status: 'fail',
            detail: err?.message ?? 'Unknown error',
            ms,
          };
          return next;
        });
      }
    }

    setRunning(false);
  }, []);

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-400">
            {results.length === 0
              ? 'Run the suite to check DB integrity, API connectivity, and algorithm health.'
              : `${passed} passed · ${failed} failed`}
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#3b82f6)', color: '#fff' }}
        >
          {running ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
          {running ? 'Running…' : 'Run Tests'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((r, i) => {
            const Icon = tests[i]?.icon ?? Database;
            return (
              <FrostedMini
                key={r.name}
                className={`flex items-start gap-3 p-4 ${
                  r.status === 'fail' ? 'border-red-500/20' : ''
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                  <Icon size={14} className="text-zinc-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white mb-0.5">{r.name}</div>
                  <div className="text-xs text-zinc-400">{r.detail}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.ms !== undefined && (
                    <span className="text-[10px] font-mono text-zinc-600">{r.ms}ms</span>
                  )}
                  <StatusIcon status={r.status} />
                </div>
              </FrostedMini>
            );
          })}
        </div>
      )}
    </div>
  );
}