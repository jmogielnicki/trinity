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
    return <p className="frontier-empty">No variants — widen the sweep ranges.</p>;
  }

  const selected = selectedId
    ? results.find((r) => r.candidate.id === selectedId) ?? null
    : null;

  return (
    <div className="study-heatmaps">
      <div className="study-heatmaps-caption">
        Rows: <strong>{axes[0].label}</strong> · Columns:{' '}
        <strong>{axes[1].label}</strong> · click a cell to apply or save that
        variant.
      </div>
      <div className="study-heatmap-grid">
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
      {selected && (
        <div className="study-heatmap-detail">
          <div className="study-heatmap-detail-info">
            <strong>{selected.candidate.label}</strong>
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
          <div className="study-heatmap-detail-actions">
            <button onClick={() => onApply(selected)}>
              Apply to single scenario
            </button>
            <button onClick={() => onSave(selected)}>Save to library</button>
            <button
              className="frontier-remove"
              onClick={() => setSelectedId(null)}
              title="dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}
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
    <div className="study-heatmap">
      <div className="study-heatmap-title">{spec.label}</div>
      <div className="study-heatmap-scroll">
        <table className="study-heatmap-table">
          <thead>
            <tr>
              <th className="study-heatmap-corner" />
              {axes[1].ticks.map((t, c) => (
                <th key={c} title={t}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {axes[0].ticks.map((rowTick, r) => (
              <tr key={r}>
                <th className="study-heatmap-rowlabel" title={rowTick}>
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
                      className={`study-heatmap-cell${isSel ? ' selected' : ''}`}
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
