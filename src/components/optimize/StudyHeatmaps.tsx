import { useState } from 'react';
import type { CandidateResult } from '../../engine/optimize';
import type { StudyAxis } from '../../engine/study';
import {
  PERFECT_FILL,
  PERFECT_RING,
  isPerfect,
  sequentialColor,
  successColor,
  successT,
  textColorFor,
} from './heatmapColor';

type MetricKey =
  | 'successRate'
  | 'p50Final'
  | 'avgAnnualWithdrawal'
  | 'minBalance';

type MetricSpec = {
  key: MetricKey;
  label: string;
  kind: 'success' | 'money';
};

const METRICS: MetricSpec[] = [
  { key: 'successRate', label: 'Success rate', kind: 'success' },
  { key: 'p50Final', label: 'Median final balance', kind: 'money' },
  { key: 'avgAnnualWithdrawal', label: 'Avg annual withdrawal', kind: 'money' },
  { key: 'minBalance', label: 'Min balance reached', kind: 'money' },
];

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}

function fmtMetric(spec: MetricSpec, v: number): string {
  if (!Number.isFinite(v)) return '—';
  return spec.kind === 'success' ? `${(v * 100).toFixed(0)}%` : fmtMoney(v);
}

type Props = {
  /** Row-major candidate results: index = row * cols + col. */
  results: CandidateResult[];
  /** Exactly two axes: [0] = rows, [1] = columns. */
  axes: StudyAxis[];
  onApply: (r: CandidateResult) => void;
  onSave: (r: CandidateResult) => void;
};

export function StudyHeatmaps({ results, axes, onApply, onSave }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (axes.length !== 2) return null;
  const rows = axes[0].ticks.length;
  const cols = axes[1].ticks.length;
  if (rows === 0 || cols === 0) {
    return (
      <p className="text-sm text-text-faint p-3 text-center border border-dashed border-text-disabled rounded">
        No variants — widen the sweep ranges.
      </p>
    );
  }

  const selected = selectedId
    ? results.find((r) => r.candidate.id === selectedId) ?? null
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-text-secondary">
        Rows: <strong>{axes[0].label}</strong> · Columns:{' '}
        <strong>{axes[1].label}</strong> · click a cell to apply or save that
        variant.
      </div>
      {selected && (
        <div className="flex justify-between items-center gap-4 border border-border-hover rounded-md px-3 py-2.5 bg-surface flex-wrap sticky top-2 z-[5] shadow-sticky">
          <div className="flex flex-col gap-0.5 text-sm text-text-secondary">
            <strong className="text-text text-base">{selected.candidate.label}</strong>
            <span>
              {selected.candidate.params.allocation} ·{' '}
              {selected.candidate.params.withdrawal} ·{' '}
              {selected.candidate.params.source ?? '—'}
            </span>
            <span>
              success{' '}
              {Number.isFinite(selected.metrics.successRate)
                ? `${(selected.metrics.successRate * 100).toFixed(1)}%`
                : '—'}{' '}
              · median final {fmtMoney(selected.metrics.p50Final)} · min balance{' '}
              {fmtMoney(selected.metrics.minBalance)}
            </span>
          </div>
          <div className="flex gap-1.5 items-center">
            <button
              className="text-sm px-2.5 py-[5px] border border-text-disabled bg-surface rounded cursor-pointer hover:bg-surface-muted"
              onClick={() => onApply(selected)}
            >
              Apply to single scenario
            </button>
            <button
              className="text-sm px-2.5 py-[5px] border border-text-disabled bg-surface rounded cursor-pointer hover:bg-surface-muted"
              onClick={() => onSave(selected)}
            >
              Save to library
            </button>
            <button
              className="bg-transparent border-none text-stale cursor-pointer text-base leading-none px-1 hover:text-error"
              onClick={() => setSelectedId(null)}
              title="dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(360px,1fr))] gap-4">
        {METRICS.map((m) => (
          <MetricHeatmap
            key={m.key}
            spec={m}
            results={results}
            axes={axes}
            cols={cols}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ))}
      </div>
    </div>
  );
}

function MetricHeatmap({
  spec,
  results,
  axes,
  cols,
  selectedId,
  onSelect,
}: {
  spec: MetricSpec;
  results: CandidateResult[];
  axes: StudyAxis[];
  cols: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // For money metrics, normalize across the finite values in this grid.
  const values = results
    .map((r) => r.metrics[spec.key])
    .filter((v): v is number => Number.isFinite(v));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = max - min || 1;

  const cellStyle = (
    v: number,
  ): { background: string; color: string; ring: boolean } => {
    if (!Number.isFinite(v)) {
      return { background: '#eee', color: '#999', ring: false };
    }
    if (spec.kind === 'success') {
      const t = successT(v);
      return {
        background: isPerfect(v) ? PERFECT_FILL : successColor(v),
        color: textColorFor(t),
        ring: isPerfect(v),
      };
    }
    const t = (v - min) / span;
    return { background: sequentialColor(t), color: textColorFor(t), ring: false };
  };

  return (
    <div className="border border-border rounded-md p-2 bg-surface min-w-0">
      <div className="text-sm font-semibold text-text-body mb-1.5">{spec.label}</div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-2xs">
          <thead>
            <tr>
              <th className="bg-surface font-medium text-text-muted text-2xs p-[2px_4px] text-left" />
              {axes[1].ticks.map((t, c) => (
                <th
                  key={c}
                  title={t}
                  className="font-medium text-text-muted text-2xs p-[2px_4px] text-left max-w-16 overflow-hidden text-ellipsis whitespace-nowrap"
                >
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {axes[0].ticks.map((rowTick, r) => (
              <tr key={r}>
                <th
                  title={rowTick}
                  className="font-medium text-text-muted text-2xs p-[2px_4px] text-left max-w-24 overflow-hidden text-ellipsis whitespace-nowrap sticky left-0 bg-surface"
                >
                  {rowTick}
                </th>
                {Array.from({ length: cols }, (_, c) => {
                  const cr = results[r * cols + c];
                  if (!cr) return <td key={c} />;
                  const v = cr.metrics[spec.key];
                  const { background, color, ring } = cellStyle(v);
                  const isSel = cr.candidate.id === selectedId;
                  return (
                    <td
                      key={c}
                      className={`p-[3px_5px] text-center cursor-pointer whitespace-nowrap tabular-nums min-w-10 hover:brightness-[1.12]${isSel ? ' outline outline-[3px] outline-text -outline-offset-[3px] font-bold' : ''}`}
                      style={{
                        background,
                        color,
                        boxShadow: ring
                          ? `inset 0 0 0 2px ${PERFECT_RING}`
                          : undefined,
                      }}
                      title={`${cr.candidate.label}\n${spec.label}: ${fmtMetric(spec, v)}`}
                      onClick={() => onSelect(cr.candidate.id)}
                    >
                      {fmtMetric(spec, v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
