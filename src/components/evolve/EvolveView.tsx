import { useEffect, useMemo } from 'react';
import { Btn } from '../ui/Btn';
import { useEvolveStore, latestChampions } from '../../store/evolveStore';
import { useResultsStore } from '../../store/resultsStore';
import { useScenarioStore } from '../../store/scenarioStore';
import {
  genomeId,
  genomeLabel,
  genomeToWithdrawal,
  type GenerationSnapshot,
  type Genome,
  type Individual,
  type IslandState,
} from '../../engine/evolve';

const ISLAND_COLORS = ['#1f77b4', '#2ca02c', '#d62728', '#9467bd'];

function islandColor(index: number): string {
  return ISLAND_COLORS[index % ISLAND_COLORS.length];
}

export function EvolveView() {
  const scenario = useScenarioStore();
  const pool = useResultsStore((s) => s.pool);
  const data = useResultsStore((s) => s.data);
  const {
    running,
    history,
    computeMs,
    lastConfig,
    weights,
    minWithdrawalRate,
    generations,
    populationSize,
    selectedGenomeId,
    setWeights,
    setMinWithdrawalRate,
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

  const currentGen = history.length
    ? history[history.length - 1].generation
    : 0;
  const totalGens = lastConfig?.generations ?? generations;
  const progressPct = totalGens > 0 ? (currentGen / totalGens) * 100 : 0;

  const latest: GenerationSnapshot | null =
    history.length > 0 ? history[history.length - 1] : null;
  const champions = useMemo(() => latestChampions(history), [history]);

  // The whole evaluated pool of the latest generation, flattened.
  const allIndividuals = useMemo(() => {
    if (!latest) return [] as Individual[];
    return latest.islands.flatMap((isl) => isl.population);
  }, [latest]);

  const selected = useMemo(() => {
    if (selectedGenomeId) {
      const hit = allIndividuals.find(
        (i) => genomeId(i.genome) === selectedGenomeId,
      );
      if (hit) return hit;
    }
    return champions[0]?.individual ?? null;
  }, [selectedGenomeId, allIndividuals, champions]);

  const horizonForViz = lastConfig?.horizonYears ?? scenario.horizonYears;
  const horizonStale =
    lastConfig && lastConfig.horizonYears !== scenario.horizonYears;

  return (
    <div className="flex flex-col gap-3.5 text-base">
      <div className="flex justify-between items-start gap-4">
        <div className="text-text-secondary text-sm max-w-[720px] leading-[1.4]">
          <strong>Evolve strategies</strong> — a genetic algorithm runs four
          independent "islands" in parallel, each optimizing for a different
          definition of best (balanced, safety-first, max spending, ramp-up).
          Islands never interbreed, so they converge on genuinely distinct
          strategies. Genome: glide-path + a 4-point withdrawal curve, with all
          withdrawal rates kept at or above your minimum-SWR floor.
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          {running ? (
            <Btn size="md" onClick={cancel}>Stop</Btn>
          ) : (
            <Btn size="md" onClick={startRun} disabled={!pool || !data}>
              {history.length ? 'Re-run evolution' : 'Run evolution'}
            </Btn>
          )}
        </div>
      </div>

      <FitnessControls
        weights={weights}
        minWithdrawalRate={minWithdrawalRate}
        generations={generations}
        populationSize={populationSize}
        running={running}
        onWeights={setWeights}
        onMinWithdrawal={setMinWithdrawalRate}
        onGenerations={setGenerations}
        onPopulation={setPopulationSize}
      />

      {(running || history.length > 0) && (
        <div className="flex flex-col gap-1">
          <div className="text-xs text-text-muted">
            Gen {currentGen} / {totalGens}
            {running ? ' · running…' : ` · done · ${computeMs.toFixed(0)} ms`}
            {horizonStale && (
              <span className="text-stale">
                {' '}
                · horizon changed since last run — re-run to refresh
              </span>
            )}
          </div>
          <div className="h-1.5 bg-border-light rounded-[3px] overflow-hidden">
            <div
              className="h-full bg-chart-blue transition-[width] duration-[120ms] linear"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {history.length > 0 && latest && (
        <>
          <ConvergenceChart history={history} />
          <ChampionRow
            champions={champions}
            horizonYears={horizonForViz}
            selectedId={selected ? genomeId(selected.genome) : null}
            onSelect={(id) => setSelected(id)}
          />
          <div className="grid [grid-template-columns:minmax(0,2fr)_minmax(0,1fr)] gap-3 max-[1100px]:[grid-template-columns:1fr]">
            <IslandTables
              islands={latest.islands}
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
  minWithdrawalRate,
  generations,
  populationSize,
  running,
  onWeights,
  onMinWithdrawal,
  onGenerations,
  onPopulation,
}: {
  weights: ReturnType<typeof useEvolveStore.getState>['weights'];
  minWithdrawalRate: number;
  generations: number;
  populationSize: number;
  running: boolean;
  onWeights: (w: Partial<typeof weights>) => void;
  onMinWithdrawal: (r: number) => void;
  onGenerations: (n: number) => void;
  onPopulation: (n: number) => void;
}) {
  return (
    <div className="border border-border-light rounded p-[10px_12px] bg-surface-page">
      <div className="text-xs text-text-secondary mb-2">
        Constraints &amp; the "Balanced" island weights — adjust then re-run.
        The Safety-first / Spend-it-down / Ramp-up islands use fixed goal
        profiles (success floor is shared across all).
      </div>
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] gap-[8px_16px]">
        <Slider
          label="Min withdrawal (SWR floor)"
          value={minWithdrawalRate}
          min={0.02}
          max={0.05}
          step={0.0025}
          format={(v) => `${(v * 100).toFixed(2)}%`}
          disabled={running}
          onChange={onMinWithdrawal}
          help="Lower bound on every withdrawal-curve point. Stops the GA from converging on trivially-low spending."
        />
        <Slider
          label="Success-rate floor"
          value={weights.successFloor}
          min={0.5}
          max={1}
          step={0.01}
          format={(v) => `${(v * 100).toFixed(0)}%`}
          disabled={running}
          onChange={(v) => onWeights({ successFloor: v })}
          help="Strategies under this success rate are heavily penalized (all islands)."
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
          help="Balanced island: reward for never getting close to depletion."
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
          help="Balanced island: reward for total real withdrawals over the horizon."
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
          help="Balanced island: bonus when later years spend more than earlier years."
        />
        <Slider
          label="Population / island"
          value={populationSize}
          min={20}
          max={200}
          step={10}
          format={(v) => `${v}`}
          disabled={running}
          onChange={onPopulation}
          help="Larger = better answers, slower. Runs for each of the 4 islands."
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
    <label
      className="grid [grid-template-columns:130px_1fr_50px] items-center gap-2 text-sm text-text-secondary"
      title={help}
    >
      <span className="text-text-secondary">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        className="w-full"
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="tabular-nums text-text text-right text-xs">{format(value)}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Convergence chart — one line per island
// ---------------------------------------------------------------------------

function ConvergenceChart({ history }: { history: GenerationSnapshot[] }) {
  const W = 720;
  const H = 190;
  const padL = 48;
  const padR = 12;
  const padT = 12;
  const padB = 28;

  const xs = history.map((h) => h.generation);
  const xMax = Math.max(1, ...xs);
  const islandCount = history[0]?.islands.length ?? 0;

  const allBest = history.flatMap((h) =>
    h.islands.map((isl) => isl.bestFitness),
  );
  const allMed = history.flatMap((h) =>
    h.islands.map((isl) => isl.medianFitness),
  );
  const yMax = Math.max(0.01, ...allBest);
  const yMin = Math.min(0, ...allMed);

  const xScale = (v: number) => padL + (v / xMax) * (W - padL - padR);
  const yScale = (v: number) =>
    H - padB - ((v - yMin) / (yMax - yMin || 1)) * (H - padT - padB);

  const islandPath = (islandIdx: number) =>
    history
      .map((h, i) => {
        const v = h.islands[islandIdx]?.bestFitness ?? 0;
        return `${i === 0 ? 'M' : 'L'}${xScale(xs[i])},${yScale(v)}`;
      })
      .join(' ');

  return (
    <div className="border border-border-light rounded p-2 bg-surface-page">
      <div className="text-xs text-text-secondary mb-1.5">
        Best fitness per generation, per island
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        <line
          x1={padL}
          x2={W - padR}
          y1={H - padB}
          y2={H - padB}
          stroke="#bbb"
        />
        <line x1={padL} x2={padL} y1={padT} y2={H - padB} stroke="#bbb" />
        {[0, 0.5, 1].map((f) => {
          const v = yMin + (yMax - yMin) * f;
          const y = yScale(v);
          return (
            <g key={f}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#eee" />
              <text
                x={padL - 6}
                y={y + 3}
                fontSize="10"
                textAnchor="end"
                fill="#666"
              >
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
        {Array.from({ length: islandCount }, (_, idx) => (
          <path
            key={idx}
            d={islandPath(idx)}
            fill="none"
            stroke={islandColor(idx)}
            strokeWidth={2}
          />
        ))}
      </svg>
      <div className="flex gap-4 text-xs text-text-secondary mt-1.5 px-1.5">
        {history[0]?.islands.map((isl, idx) => (
          <span key={isl.profile.id}>
            <span
              className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1"
              style={{ background: islandColor(idx) }}
            />{' '}
            {isl.profile.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Champions — best of each island
// ---------------------------------------------------------------------------

function ChampionRow({
  champions,
  horizonYears,
  selectedId,
  onSelect,
}: {
  champions: ReturnType<typeof latestChampions>;
  horizonYears: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] gap-2.5">
      {champions.map((c, idx) => {
        const id = genomeId(c.individual.genome);
        const m = c.individual.metrics!;
        return (
          <div
            key={c.islandId}
            className={`border border-border rounded border-t-[3px] p-[8px_10px] bg-surface cursor-pointer flex flex-col gap-[5px] hover:bg-surface-page${selectedId === id ? ' shadow-[inset_0_0_0_2px_var(--color-chart-blue)]' : ''}`}
            style={{ borderTopColor: islandColor(idx) }}
            onClick={() => onSelect(id)}
          >
            <div
              className="text-sm font-semibold"
              style={{ color: islandColor(idx) }}
            >
              {c.islandName}
            </div>
            <div className="text-2xs text-text-faint leading-[1.3]">
              {genomeLabel(c.individual.genome)}
            </div>
            <WithdrawalSpark
              genome={c.individual.genome}
              horizonYears={horizonYears}
              color={islandColor(idx)}
              compact
            />
            <div className="flex flex-wrap gap-[2px_10px] text-2xs text-text-secondary">
              <span>success {(m.successRate * 100).toFixed(1)}%</span>
              <span>safety p5 {(m.safetyP5 * 100).toFixed(0)}%</span>
              <span>spend {m.spendingMedian.toFixed(2)}×</span>
              <span>ramp {m.slopeMedian.toFixed(2)}×</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-island top-strategy tables
// ---------------------------------------------------------------------------

function IslandTables({
  islands,
  selectedId,
  onSelect,
}: {
  islands: IslandState[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const TOP = 5;
  const thCls = 'px-2 py-1.5 text-left border-b border-border-light whitespace-nowrap text-text-muted font-medium text-xs uppercase tracking-[0.04em] bg-surface-hover';
  const tdCls = 'px-2 py-1.5 text-left border-b border-border-light whitespace-nowrap text-sm';
  return (
    <div className="flex flex-col gap-3.5">
      {islands.map((isl, idx) => (
        <div key={isl.profile.id} className="overflow-x-auto">
          <div
            className="text-xs text-text-secondary mb-1.5"
            style={{ color: islandColor(idx) }}
          >
            {isl.profile.name} — top {Math.min(TOP, isl.population.length)}{' '}
            <span className="text-text-placeholder font-normal normal-case tracking-normal">({isl.profile.blurb})</span>
          </div>
          <table className="w-full border-collapse text-sm [&_tbody_tr:hover]:bg-surface-panel">
            <thead>
              <tr>
                <th className={thCls}>Strategy</th>
                <th className={thCls}>Fit</th>
                <th className={thCls}>Success</th>
                <th className={thCls}>Safety</th>
                <th className={thCls}>Spend</th>
                <th className={thCls}>Ramp</th>
              </tr>
            </thead>
            <tbody>
              {isl.population.slice(0, TOP).map((ind) => {
                const id = genomeId(ind.genome);
                const m = ind.metrics!;
                return (
                  <tr
                    key={id}
                    onClick={() => onSelect(id)}
                    className={selectedId === id ? 'bg-surface-code' : ''}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className={tdCls}>{genomeLabel(ind.genome)}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{(ind.fitness ?? 0).toFixed(3)}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{(m.successRate * 100).toFixed(1)}%</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{(m.safetyP5 * 100).toFixed(0)}%</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{m.spendingMedian.toFixed(2)}×</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{m.slopeMedian.toFixed(2)}×</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
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
  const m = individual.metrics;
  return (
    <div className="border border-border-light rounded p-2.5 bg-surface-page flex flex-col gap-1.5">
      <div className="text-xs text-text-secondary mb-1.5">Selected strategy</div>
      <div className="text-sm text-text-body">{genomeLabel(g)}</div>
      <div className="flex flex-col gap-2">
        <WithdrawalSpark
          genome={g}
          horizonYears={horizonYears}
          color="#2ca02c"
        />
        <GlideSpark genome={g} horizonYears={horizonYears} />
      </div>
      <div className="text-xs text-text-muted">
        success {((m?.successRate ?? 0) * 100).toFixed(1)}% · spending median{' '}
        {m?.spendingMedian.toFixed(2)}× initial · late/early{' '}
        {m?.slopeMedian.toFixed(2)}× · worst start {m?.worstStartYear ?? '—'}
      </div>
    </div>
  );
}

function WithdrawalSpark({
  genome,
  horizonYears,
  color,
  compact,
}: {
  genome: Genome;
  horizonYears: number;
  color: string;
  compact?: boolean;
}) {
  const W = 320;
  const H = compact ? 72 : 110;
  const padL = 32;
  const padR = 8;
  const padT = 8;
  const padB = compact ? 14 : 22;
  const wd = genomeToWithdrawal(genome, horizonYears);
  const points = wd.type === 'piecewiseLinear' ? wd.points : [];
  const yMax = 0.08;
  const xScale = (t: number) =>
    padL + (t / Math.max(1, horizonYears - 1)) * (W - padL - padR);
  const yScale = (r: number) => H - padB - (r / yMax) * (H - padT - padB);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.t)},${yScale(p.rate)}`)
    .join(' ');
  return (
    <div className="bg-surface rounded-[3px] p-1">
      {!compact && (
        <div className="text-2xs text-text-faint px-1 pb-0.5">
          Withdrawal rate (% of initial)
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        <line
          x1={padL}
          x2={W - padR}
          y1={H - padB}
          y2={H - padB}
          stroke="#bbb"
        />
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
            <text
              x={padL - 4}
              y={yScale(r) + 3}
              fontSize="9"
              textAnchor="end"
              fill="#888"
            >
              {(r * 100).toFixed(0)}
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke={color} strokeWidth={2} />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={xScale(p.t)}
            cy={yScale(p.rate)}
            r={3}
            fill={color}
          />
        ))}
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
  const padL = 32;
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
  return (
    <div className="bg-surface rounded-[3px] p-1">
      <div className="text-2xs text-text-faint px-1 pb-0.5">
        Glide path (stock = green, bond = blue)
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        <rect
          x={padL}
          y={padT}
          width={W - padL - padR}
          height={H - padT - padB}
          fill="#9ecae1"
          opacity={0.55}
        />
        <path d={stockPath} fill="#a1d99b" opacity={0.9} />
        <line
          x1={padL}
          x2={W - padR}
          y1={H - padB}
          y2={H - padB}
          stroke="#bbb"
        />
        <line x1={padL} x2={padL} y1={padT} y2={H - padB} stroke="#bbb" />
        {[0, 0.5, 1].map((v) => (
          <text
            key={v}
            x={padL - 4}
            y={yScale(v) + 3}
            fontSize="9"
            textAnchor="end"
            fill="#888"
          >
            {(v * 100).toFixed(0)}
          </text>
        ))}
        <text
          x={(padL + W - padR) / 2}
          y={H - 6}
          fontSize="9"
          textAnchor="middle"
          fill="#666"
        >
          year
        </text>
      </svg>
    </div>
  );
}
