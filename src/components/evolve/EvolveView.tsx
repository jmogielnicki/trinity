import { useEffect, useMemo } from 'react';
import { useEvolveStore, EVOLVE_TOP_N } from '../../store/evolveStore';
import { useResultsStore } from '../../store/resultsStore';
import { useScenarioStore } from '../../store/scenarioStore';
import {
  genomeId,
  genomeLabel,
  genomeToWithdrawal,
  type Genome,
  type Individual,
} from '../../engine/evolve';

export function EvolveView() {
  const scenario = useScenarioStore();
  const pool = useResultsStore((s) => s.pool);
  const data = useResultsStore((s) => s.data);
  const {
    running,
    history,
    best,
    topN,
    weights,
    generations,
    populationSize,
    computeMs,
    lastConfig,
    selectedGenomeId,
    setWeights,
    setGenerations,
    setPopulationSize,
    setSelected,
    cancel,
    run,
  } = useEvolveStore();

  const startRun = () => {
    if (!pool || !data) return;
    void run(
      {
        initialBalance: scenario.initialBalance,
        horizonYears: scenario.horizonYears,
        tailMethod: scenario.tailMethod,
      },
      pool,
    );
  };

  // Auto-run once when first entering the view.
  useEffect(() => {
    if (!pool || !data) return;
    if (history.length === 0 && !running) startRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, data]);

  const currentGen = history.length ? history[history.length - 1].generation : 0;
  const totalGens = lastConfig?.generations ?? generations;
  const progressPct = totalGens > 0 ? (currentGen / totalGens) * 100 : 0;

  const selected = useMemo(() => {
    if (!selectedGenomeId) return best ?? topN[0] ?? null;
    return topN.find((i) => genomeId(i.genome) === selectedGenomeId) ?? best;
  }, [selectedGenomeId, best, topN]);

  const horizonForViz = lastConfig?.horizonYears ?? scenario.horizonYears;
  const horizonStale =
    lastConfig && lastConfig.horizonYears !== scenario.horizonYears;

  return (
    <div className="frontier-view evolve-view">
      <div className="frontier-header">
        <div>
          <strong>Evolve strategies</strong> — runs a genetic algorithm to
          discover allocation+withdrawal pairs that survive history while
          spending generously and ramping up over time. Each generation scores
          a population of strategies, breeds the best, and mutates the
          children. Genome: glide-path (start/end stock %, transition years) +
          a 4-point withdrawal curve.
        </div>
        <div className="frontier-actions">
          {running ? (
            <button onClick={cancel}>Stop</button>
          ) : (
            <button onClick={startRun} disabled={!pool || !data}>
              {history.length ? 'Re-run evolution' : 'Run evolution'}
            </button>
          )}
        </div>
      </div>

      <FitnessControls
        weights={weights}
        generations={generations}
        populationSize={populationSize}
        running={running}
        onWeights={setWeights}
        onGenerations={setGenerations}
        onPopulation={setPopulationSize}
      />

      {(running || history.length > 0) && (
        <div className="evolve-progress">
          <div className="evolve-progress-label">
            Gen {currentGen} / {totalGens}
            {running ? ' · running…' : ` · done · ${computeMs.toFixed(0)} ms`}
            {horizonStale && (
              <span className="frontier-stale">
                {' '}
                · horizon changed since last run — re-run to refresh
              </span>
            )}
          </div>
          <div className="evolve-progress-bar">
            <div
              className="evolve-progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {history.length > 0 && (
        <>
          <ConvergenceChart history={history} />
          <div className="evolve-split">
            <TopNTable
              topN={topN}
              selectedId={selected ? genomeId(selected.genome) : null}
              onSelect={(id) => setSelected(id)}
            />
            <StrategyPreview
              individual={selected}
              horizonYears={horizonForViz}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fitness weight controls
// ---------------------------------------------------------------------------

function FitnessControls({
  weights,
  generations,
  populationSize,
  running,
  onWeights,
  onGenerations,
  onPopulation,
}: {
  weights: ReturnType<typeof useEvolveStore.getState>['weights'];
  generations: number;
  populationSize: number;
  running: boolean;
  onWeights: (w: Partial<typeof weights>) => void;
  onGenerations: (n: number) => void;
  onPopulation: (n: number) => void;
}) {
  return (
    <div className="evolve-controls">
      <div className="evolve-controls-title">
        What does "optimal" mean? Adjust then re-run.
      </div>
      <div className="evolve-controls-grid">
        <Slider
          label="Success-rate floor"
          value={weights.successFloor}
          min={0.5}
          max={1}
          step={0.01}
          format={(v) => `${(v * 100).toFixed(0)}%`}
          disabled={running}
          onChange={(v) => onWeights({ successFloor: v })}
          help="Strategies under this success rate are heavily penalized."
        />
        <Slider
          label="Safety weight"
          value={weights.safety}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          disabled={running}
          onChange={(v) => onWeights({ safety: v })}
          help="Reward for never getting close to depletion (p5 of min balance)."
        />
        <Slider
          label="Spending weight"
          value={weights.spending}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          disabled={running}
          onChange={(v) => onWeights({ spending: v })}
          help="Reward for total real withdrawals over the horizon."
        />
        <Slider
          label="Ramp-up bonus"
          value={weights.slope}
          min={0}
          max={0.5}
          step={0.02}
          format={(v) => v.toFixed(2)}
          disabled={running}
          onChange={(v) => onWeights({ slope: v })}
          help="Bonus when later years spend more than earlier years."
        />
        <Slider
          label="Population"
          value={populationSize}
          min={20}
          max={200}
          step={10}
          format={(v) => `${v}`}
          disabled={running}
          onChange={onPopulation}
          help="Larger = better answers, slower."
        />
        <Slider
          label="Generations"
          value={generations}
          min={5}
          max={80}
          step={1}
          format={(v) => `${v}`}
          disabled={running}
          onChange={onGenerations}
          help="More = converges further, slower."
        />
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  disabled,
  onChange,
  help,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  disabled?: boolean;
  onChange: (v: number) => void;
  help?: string;
}) {
  return (
    <label className="evolve-slider" title={help}>
      <span className="evolve-slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="evolve-slider-value">{format(value)}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Convergence chart
// ---------------------------------------------------------------------------

function ConvergenceChart({
  history,
}: {
  history: ReturnType<typeof useEvolveStore.getState>['history'];
}) {
  const W = 720;
  const H = 180;
  const padL = 48;
  const padR = 12;
  const padT = 12;
  const padB = 28;

  const xs = history.map((h) => h.generation);
  const bestVals = history.map((h) => h.bestFitness);
  const medVals = history.map((h) => h.medianFitness);
  const xMax = Math.max(1, ...xs);
  const yMax = Math.max(0.01, ...bestVals);
  const yMin = Math.min(0, ...medVals);

  const xScale = (v: number) =>
    padL + (v / xMax) * (W - padL - padR);
  const yScale = (v: number) =>
    H - padB - ((v - yMin) / (yMax - yMin || 1)) * (H - padT - padB);

  const path = (vals: number[]) =>
    vals
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${xScale(xs[i])},${yScale(v)}`)
      .join(' ');

  return (
    <div className="frontier-scatter-wrap">
      <div className="frontier-bars-title">Best / median fitness per generation</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="#bbb" />
        <line x1={padL} x2={padL} y1={padT} y2={H - padB} stroke="#bbb" />
        {[0, 0.5, 1].map((f) => {
          const v = yMin + (yMax - yMin) * f;
          const y = yScale(v);
          return (
            <g key={f}>
              <line x1={padL - 4} x2={W - padR} y1={y} y2={y} stroke="#eee" />
              <text x={padL - 6} y={y + 3} fontSize="10" textAnchor="end" fill="#666">
                {v.toFixed(2)}
              </text>
            </g>
          );
        })}
        <text
          x={(padL + W - padR) / 2}
          y={H - 6}
          fontSize="11"
          textAnchor="middle"
          fill="#444"
        >
          generation
        </text>
        <path d={path(medVals)} fill="none" stroke="#aaa" strokeWidth={1.5} />
        <path d={path(bestVals)} fill="none" stroke="#1f77b4" strokeWidth={2} />
        {history.length > 0 && (
          <circle
            cx={xScale(xs[xs.length - 1])}
            cy={yScale(bestVals[bestVals.length - 1])}
            r={3.5}
            fill="#1f77b4"
          />
        )}
      </svg>
      <div className="frontier-legend">
        <span><span className="dot" style={{ background: '#1f77b4' }} /> best</span>
        <span><span className="dot" style={{ background: '#aaa' }} /> median</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-N table
// ---------------------------------------------------------------------------

function TopNTable({
  topN,
  selectedId,
  onSelect,
}: {
  topN: Individual[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="frontier-table-wrap evolve-topn">
      <div className="frontier-bars-title">
        Top {Math.min(EVOLVE_TOP_N, topN.length)} strategies (current generation)
      </div>
      <table className="frontier-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Strategy</th>
            <th>Fitness</th>
            <th>Success</th>
            <th>Safety p5</th>
            <th>Spending</th>
            <th>Slope</th>
            <th>P50 final</th>
          </tr>
        </thead>
        <tbody>
          {topN.map((ind, i) => {
            const id = genomeId(ind.genome);
            const m = ind.metrics!;
            return (
              <tr
                key={id}
                onClick={() => onSelect(id)}
                className={selectedId === id ? 'evolve-row-selected' : ''}
                style={{ cursor: 'pointer' }}
              >
                <td>{i + 1}</td>
                <td>{genomeLabel(ind.genome)}</td>
                <td>{(ind.fitness ?? 0).toFixed(3)}</td>
                <td>{(m.successRate * 100).toFixed(1)}%</td>
                <td>{(m.safetyP5 * 100).toFixed(0)}%</td>
                <td>{m.spendingMedian.toFixed(2)}×</td>
                <td>{m.slopeMedian.toFixed(2)}×</td>
                <td>{fmtMoney(m.p50Final)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Strategy preview (withdrawal curve + glide path sparks)
// ---------------------------------------------------------------------------

function StrategyPreview({
  individual,
  horizonYears,
}: {
  individual: Individual | null;
  horizonYears: number;
}) {
  if (!individual) return null;
  const g = individual.genome;
  return (
    <div className="evolve-preview">
      <div className="frontier-bars-title">Selected strategy</div>
      <div className="evolve-preview-label">{genomeLabel(g)}</div>
      <div className="evolve-spark-row">
        <WithdrawalSpark genome={g} horizonYears={horizonYears} />
        <GlideSpark genome={g} horizonYears={horizonYears} />
      </div>
      <div className="evolve-preview-stats">
        spending median {individual.metrics?.spendingMedian.toFixed(2)}× initial ·
        late/early {individual.metrics?.slopeMedian.toFixed(2)}× ·
        worst start {individual.metrics?.worstStartYear ?? '—'}
      </div>
    </div>
  );
}

function WithdrawalSpark({
  genome,
  horizonYears,
}: {
  genome: Genome;
  horizonYears: number;
}) {
  const W = 320;
  const H = 110;
  const padL = 36;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const wd = genomeToWithdrawal(genome, horizonYears);
  const points =
    wd.type === 'piecewiseLinear' ? wd.points : [];
  const yMax = 0.08;
  const xScale = (t: number) =>
    padL + (t / Math.max(1, horizonYears - 1)) * (W - padL - padR);
  const yScale = (r: number) =>
    H - padB - (r / yMax) * (H - padT - padB);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.t)},${yScale(p.rate)}`)
    .join(' ');
  return (
    <div className="evolve-spark">
      <div className="evolve-spark-title">Withdrawal rate (% of initial)</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="#bbb" />
        <line x1={padL} x2={padL} y1={padT} y2={H - padB} stroke="#bbb" />
        {[0.02, 0.04, 0.06, 0.08].map((r) => (
          <g key={r}>
            <line
              x1={padL}
              x2={W - padR}
              y1={yScale(r)}
              y2={yScale(r)}
              stroke="#eee"
            />
            <text x={padL - 4} y={yScale(r) + 3} fontSize="9" textAnchor="end" fill="#888">
              {(r * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke="#2ca02c" strokeWidth={2} />
        {points.map((p, i) => (
          <circle key={i} cx={xScale(p.t)} cy={yScale(p.rate)} r={3} fill="#2ca02c" />
        ))}
        <text x={(padL + W - padR) / 2} y={H - 6} fontSize="9" textAnchor="middle" fill="#666">
          year
        </text>
      </svg>
    </div>
  );
}

function GlideSpark({
  genome,
  horizonYears,
}: {
  genome: Genome;
  horizonYears: number;
}) {
  const W = 320;
  const H = 110;
  const padL = 36;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const transition = Math.max(1, Math.round(genome.transitionYears));
  const xScale = (t: number) =>
    padL + (t / Math.max(1, horizonYears - 1)) * (W - padL - padR);
  const yScale = (v: number) => H - padB - v * (H - padT - padB);
  const stockAt = (t: number) => {
    const f = Math.min(1, t / transition);
    return genome.startStock + (genome.endStock - genome.startStock) * f;
  };
  const years = Array.from({ length: horizonYears }, (_, i) => i);
  const stockPath =
    `M${xScale(0)},${yScale(0)} ` +
    years.map((t) => `L${xScale(t)},${yScale(stockAt(t))}`).join(' ') +
    ` L${xScale(horizonYears - 1)},${yScale(0)} Z`;
  const topPath =
    `M${xScale(0)},${yScale(1)} ` +
    years.map((t) => `L${xScale(t)},${yScale(1)}`).join(' ') +
    ` L${xScale(horizonYears - 1)},${yScale(stockAt(horizonYears - 1))}` +
    years
      .slice()
      .reverse()
      .map((t) => `L${xScale(t)},${yScale(stockAt(t))}`)
      .join(' ') +
    ' Z';
  return (
    <div className="evolve-spark">
      <div className="evolve-spark-title">Glide path (stock = green, bond = blue)</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="#bbb" />
        <line x1={padL} x2={padL} y1={padT} y2={H - padB} stroke="#bbb" />
        <path d={topPath} fill="#9ecae1" opacity={0.6} />
        <path d={stockPath} fill="#a1d99b" opacity={0.85} />
        {[0, 0.5, 1].map((v) => (
          <text
            key={v}
            x={padL - 4}
            y={yScale(v) + 3}
            fontSize="9"
            textAnchor="end"
            fill="#888"
          >
            {(v * 100).toFixed(0)}%
          </text>
        ))}
        <text x={(padL + W - padR) / 2} y={H - 6} fontSize="9" textAnchor="middle" fill="#666">
          year
        </text>
      </svg>
    </div>
  );
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}
