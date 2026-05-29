import type { CandidateResult } from '../../engine/optimize';
import type { StudyAxis } from '../../engine/study';
import { CHART } from '../colors';
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
  /** Candidate ids currently in the overlay (highlighted in the grid). */
  selectedIds: Set<string>;
  /** Toggle a cell's variant in/out of the overlay. */
  onToggle: (id: string) => void;
};

export function StudyHeatmaps({ results, axes, selectedIds, onToggle }: Props) {
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

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-text-secondary">
        Rows: <strong>{axes[0].label}</strong> · Columns:{' '}
        <strong>{axes[1].label}</strong> · click a cell to add that variant to
        the overlay above.
      </div>
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(360px,1fr))] gap-4">
        {METRICS.map((m) => (
          <MetricHeatmap
            key={m.key}
            spec={m}
            results={results}
            axes={axes}
            cols={cols}
            selectedIds={selectedIds}
            onToggle={onToggle}
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
  selectedIds,
  onToggle,
}: {
  spec: MetricSpec;
  results: CandidateResult[];
  axes: StudyAxis[];
  cols: number;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
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
      return { background: CHART.hairline, color: CHART.faint, ring: false };
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
                  const isSel = selectedIds.has(cr.candidate.id);
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
                      title={`${cr.candidate.label}\n${spec.label}: ${fmtMetric(spec, v)}\n(click to ${isSel ? 'remove from' : 'add to'} overlay)`}
                      onClick={() => onToggle(cr.candidate.id)}
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
