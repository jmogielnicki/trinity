import type { ReactNode } from 'react';
import type { AllocationStrategy, WithdrawalStrategy } from '../../engine/strategies';
import type { WithdrawalSource } from '../../engine/withdrawalSource';
import { NumericInput } from '../controls/NumericInput';
import {
  SOURCE_PRESETS,
  allocationRangeVariants,
  describeAllocation,
  describeSource,
  describeWithdrawal,
  rangeValues,
  type AllocationRangeSpec,
  type StudyConfig,
  type StudyDimension,
  type WithdrawalFamily,
  type WithdrawalRangeSpec,
} from '../../engine/study';
import { useOptimizeStore } from '../../store/optimizeStore';
import { useScenarioStore } from '../../store/scenarioStore';
import { AllocationEditor } from '../controls/AllocationEditor';
import { WithdrawalEditor } from '../controls/WithdrawalEditor';
import { WithdrawalSourceInput } from '../controls/WithdrawalSourceInput';

const DIMENSIONS: Array<{ key: StudyDimension; label: string }> = [
  { key: 'allocation', label: 'Holdings mix' },
  { key: 'withdrawal', label: 'Withdrawal strategy' },
  { key: 'source', label: 'Withdrawal source' },
];

const WD_FAMILY_LABELS: Record<WithdrawalFamily, string> = {
  fixedPercent: 'Fixed %',
  percentOfBalance: '% of balance',
  floorAndUpside: 'Floor + upside',
  ratchet: 'Ratchet',
};

function familyDefault(family: WithdrawalFamily): WithdrawalRangeSpec {
  switch (family) {
    case 'fixedPercent':
      return { family, from: 0.03, to: 0.06, step: 0.0025 };
    case 'percentOfBalance':
      return { family, floor: 0.0325, from: 0.03, to: 0.06, step: 0.005 };
    case 'floorAndUpside':
      return {
        family,
        sweep: 'floor',
        floor: 0.035,
        marginalSpend: 0.02,
        from: 0.03,
        to: 0.05,
        step: 0.0025,
      };
    case 'ratchet':
      return {
        family,
        sweep: 'baseRate',
        baseRate: 0.0325,
        stepSize: 0.1,
        stepBoost: 0.05,
        from: 0.03,
        to: 0.05,
        step: 0.0025,
      };
  }
}

// Flat grayscale icons for the pin / sweep toggle.
function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor" aria-hidden>
      <path d="M6 1.4h4l-.7 5.1 2.7 2.4v1.1H4V8.9l2.7-2.4z" />
      <rect x="7.4" y="9.6" width="1.2" height="5" />
    </svg>
  );
}

function SweepIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 8h10M5.5 5 3 8l2.5 3M10.5 5 13 8l-2.5 3" />
    </svg>
  );
}

export function StudyConfigPanel() {
  const { study, setStudy } = useOptimizeStore();
  const horizonYears = useScenarioStore((s) => s.horizonYears);
  const update = (patch: Partial<StudyConfig>) => setStudy({ ...study, ...patch });
  const sweptCount = study.varying.length;

  const setPinned = (key: StudyDimension) => {
    if (!study.varying.includes(key)) return;
    if (study.varying.length <= 1) return; // always keep one swept
    update({ varying: study.varying.filter((d) => d !== key) });
  };
  const setSwept = (key: StudyDimension) => {
    if (study.varying.includes(key)) return;
    if (study.varying.length >= 2) return; // 2D max
    update({ varying: [...study.varying, key] });
  };

  const modeBtnCls = (active: boolean) =>
    `inline-flex items-center gap-1 text-xs px-[10px] py-1 border-none rounded-md cursor-pointer font-medium font-[inherit] transition-[background,color,box-shadow] duration-[120ms] whitespace-nowrap flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed${active ? ' bg-surface text-[#1a1a1a] shadow-card' : ' bg-transparent text-text-muted hover:bg-white/60 hover:text-text-body'}`;

  return (
    <div className="flex flex-col gap-2 border border-[#e4e4e4] rounded-md p-3 bg-surface-page">
      <div className="text-sm text-text-muted leading-[1.4]">
        Pin the dimensions you want held constant and sweep the rest. Sweep one
        for a scatter / trajectory comparison, or two for a heatmap grid (max
        two).
      </div>
      {DIMENSIONS.map(({ key, label }) => {
        const sweepIdx = study.varying.indexOf(key);
        const swept = sweepIdx >= 0;
        const role =
          swept && sweptCount === 2 ? (sweepIdx === 0 ? 'rows' : 'columns') : null;
        return (
          <div key={key} className={`border rounded-[5px] bg-surface px-[10px] py-2${swept ? ' border-chart-blue shadow-[0_0_0_1px_var(--color-chart-blue)_inset]' : ' border-[#e8e8e8]'}`}>
            <div className="flex justify-between items-center gap-3">
              <span className="text-base font-semibold text-text-body">
                {label}
                {role && <span className="font-medium text-text-faint text-xs"> · {role}</span>}
              </span>
              <div className="flex gap-0.5 bg-[#efefef] rounded-lg p-[3px] flex-shrink-0">
                <button
                  className={modeBtnCls(!swept)}
                  onClick={() => setPinned(key)}
                  disabled={swept && sweptCount <= 1}
                  title="Hold this dimension constant"
                >
                  <PinIcon /> pinned
                </button>
                <button
                  className={modeBtnCls(swept)}
                  onClick={() => setSwept(key)}
                  disabled={!swept && sweptCount >= 2}
                  title="Sweep this dimension across many variants"
                >
                  <SweepIcon /> sweep
                </button>
              </div>
            </div>
            <div className="mt-2">
              {swept ? (
                <VaryEditor
                  dim={key}
                  study={study}
                  update={update}
                  horizonYears={horizonYears}
                />
              ) : (
                <LockedEditor
                  dim={key}
                  study={study}
                  update={update}
                  horizonYears={horizonYears}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Locked (pinned) dimension editors — reuse the single-scenario controls.
// ---------------------------------------------------------------------------

function LockedEditor({
  dim,
  study,
  update,
  horizonYears,
}: {
  dim: StudyDimension;
  study: StudyConfig;
  update: (p: Partial<StudyConfig>) => void;
  horizonYears: number;
}) {
  if (dim === 'allocation') {
    return (
      <AllocationEditor
        horizonYears={horizonYears}
        allocation={study.lockedAllocation}
        onChange={(a) => update({ lockedAllocation: a })}
      />
    );
  }
  if (dim === 'withdrawal') {
    return (
      <WithdrawalEditor
        horizonYears={horizonYears}
        withdrawal={study.lockedWithdrawal}
        onChange={(w) => update({ lockedWithdrawal: w })}
      />
    );
  }
  return (
    <WithdrawalSourceInput
      hideLabel
      value={study.lockedSource}
      onChange={(s) => update({ lockedSource: s })}
    />
  );
}

// ---------------------------------------------------------------------------
// Varying dimension editor — range or list mode.
// ---------------------------------------------------------------------------

function VaryEditor({
  dim,
  study,
  update,
  horizonYears,
}: {
  dim: StudyDimension;
  study: StudyConfig;
  update: (p: Partial<StudyConfig>) => void;
  horizonYears: number;
}) {
  const mode = study.varyMode[dim];
  const setMode = (m: 'range' | 'list') =>
    update({ varyMode: { ...study.varyMode, [dim]: m } });
  return (
    <>
      <div className="flex gap-0.5 bg-[#efefef] rounded-lg p-[3px] overflow-x-auto scrollbar-none mb-2">
        <button
          className={`text-xs px-[10px] py-1 border-none rounded-md cursor-pointer font-medium font-[inherit] transition-[background,color,box-shadow] duration-[120ms] whitespace-nowrap flex-shrink-0${mode === 'range' ? ' bg-surface text-[#1a1a1a] shadow-card' : ' bg-transparent text-text-muted hover:bg-white/60 hover:text-text-body'}`}
          onClick={() => setMode('range')}
        >
          range
        </button>
        <button
          className={`text-xs px-[10px] py-1 border-none rounded-md cursor-pointer font-medium font-[inherit] transition-[background,color,box-shadow] duration-[120ms] whitespace-nowrap flex-shrink-0${mode === 'list' ? ' bg-surface text-[#1a1a1a] shadow-card' : ' bg-transparent text-text-muted hover:bg-white/60 hover:text-text-body'}`}
          onClick={() => setMode('list')}
        >
          hand-picked list
        </button>
      </div>
      {mode === 'range' ? (
        <RangeEditor dim={dim} study={study} update={update} />
      ) : (
        <ListEditor
          dim={dim}
          study={study}
          update={update}
          horizonYears={horizonYears}
        />
      )}
      <VariantCount dim={dim} study={study} />
    </>
  );
}

function VariantCount({
  dim,
  study,
}: {
  dim: StudyDimension;
  study: StudyConfig;
}) {
  let n: number;
  if (study.varyMode[dim] === 'list') {
    n =
      dim === 'allocation'
        ? study.allocationList.length
        : dim === 'withdrawal'
          ? study.withdrawalList.length
          : study.sourceList.length;
  } else if (dim === 'allocation') {
    n = allocationRangeVariants(study.allocationRange).length;
  } else if (dim === 'withdrawal') {
    const r = study.withdrawalRange;
    n = rangeValues(r.from, r.to, r.step).length;
  } else {
    n = study.sourcePresetIds.length;
  }
  return (
    <div className="text-xs text-[#777] py-[2px] pb-1">
      {n} variant{n === 1 ? '' : 's'} on this axis.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Range editors
// ---------------------------------------------------------------------------

function RangeEditor({
  dim,
  study,
  update,
}: {
  dim: StudyDimension;
  study: StudyConfig;
  update: (p: Partial<StudyConfig>) => void;
}) {
  if (dim === 'allocation') {
    const r = study.allocationRange;
    const set = (patch: Partial<AllocationRangeSpec>) =>
      update({ allocationRange: { ...r, ...patch } });
    return (
      <div className="flex flex-col gap-2">
        <div className="text-xs text-[#777] py-[2px] pb-1">
          Sweeps every stock × bond combination; cash fills the remainder.
          Combinations over 100% are skipped.
        </div>
        <PctRange
          label="Stocks"
          from={r.fromStock}
          to={r.toStock}
          step={r.stepStock}
          onChange={(fromStock, toStock, stepStock) =>
            set({ fromStock, toStock, stepStock })
          }
        />
        <PctRange
          label="Bonds"
          from={r.fromBond}
          to={r.toBond}
          step={r.stepBond}
          onChange={(fromBond, toBond, stepBond) =>
            set({ fromBond, toBond, stepBond })
          }
        />
      </div>
    );
  }
  if (dim === 'withdrawal') {
    return <WithdrawalRangeEditor spec={study.withdrawalRange} update={update} />;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-[#777] py-[2px] pb-1">Race these withdrawal-source strategies:</div>
      {SOURCE_PRESETS.map((p) => (
        <label key={p.id} className="flex items-center gap-1.5 text-sm text-[#444]">
          <input
            type="checkbox"
            checked={study.sourcePresetIds.includes(p.id)}
            onChange={(e) => {
              const set = new Set(study.sourcePresetIds);
              if (e.target.checked) set.add(p.id);
              else set.delete(p.id);
              update({
                sourcePresetIds: SOURCE_PRESETS.filter((x) => set.has(x.id)).map(
                  (x) => x.id,
                ),
              });
            }}
          />
          {p.label}
        </label>
      ))}
    </div>
  );
}

function WithdrawalRangeEditor({
  spec,
  update,
}: {
  spec: WithdrawalRangeSpec;
  update: (p: Partial<StudyConfig>) => void;
}) {
  const setSpec = (s: WithdrawalRangeSpec) => update({ withdrawalRange: s });
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-[3px] items-start text-sm text-text-secondary">
        Family
        <select
          className="px-1.5 py-[3px] border border-text-disabled rounded-[3px] text-sm"
          value={spec.family}
          onChange={(e) =>
            setSpec(familyDefault(e.target.value as WithdrawalFamily))
          }
        >
          {(Object.keys(WD_FAMILY_LABELS) as WithdrawalFamily[]).map((f) => (
            <option key={f} value={f}>
              {WD_FAMILY_LABELS[f]}
            </option>
          ))}
        </select>
      </label>

      {spec.family === 'fixedPercent' && (
        <>
          <div className="text-xs text-[#777] py-[2px] pb-1">Sweep the fixed withdrawal rate.</div>
          <PctRange
            from={spec.from}
            to={spec.to}
            step={spec.step}
            onChange={(from, to, step) =>
              setSpec({ family: 'fixedPercent', from, to, step })
            }
          />
        </>
      )}

      {spec.family === 'percentOfBalance' && (
        <>
          <div className="text-xs text-[#777] py-[2px] pb-1">
            Sweep the % of current balance withdrawn; the floor is pinned.
          </div>
          <PctNum
            label="Floor (% of initial)"
            value={spec.floor}
            onChange={(floor) => setSpec({ ...spec, floor })}
          />
          <PctRange
            from={spec.from}
            to={spec.to}
            step={spec.step}
            onChange={(from, to, step) => setSpec({ ...spec, from, to, step })}
          />
        </>
      )}

      {spec.family === 'floorAndUpside' && (
        <>
          <label className="flex flex-col gap-[3px] items-start text-sm text-text-secondary">
            Sweep
            <select
              className="px-1.5 py-[3px] border border-text-disabled rounded-[3px] text-sm"
              value={spec.sweep}
              onChange={(e) =>
                setSpec({
                  ...spec,
                  sweep: e.target.value as 'floor' | 'marginalSpend',
                })
              }
            >
              <option value="floor">floor %</option>
              <option value="marginalSpend">marginal spend</option>
            </select>
          </label>
          {spec.sweep === 'floor' ? (
            <>
              <MarginalNum
                label="Marginal spend ($k per $1M over initial)"
                value={spec.marginalSpend}
                onChange={(marginalSpend) => setSpec({ ...spec, marginalSpend })}
              />
              <PctRange
                from={spec.from}
                to={spec.to}
                step={spec.step}
                onChange={(from, to, step) => setSpec({ ...spec, from, to, step })}
              />
            </>
          ) : (
            <>
              <PctNum
                label="Floor (% of initial)"
                value={spec.floor}
                onChange={(floor) => setSpec({ ...spec, floor })}
              />
              <MarginalRange
                from={spec.from}
                to={spec.to}
                step={spec.step}
                onChange={(from, to, step) => setSpec({ ...spec, from, to, step })}
              />
            </>
          )}
        </>
      )}

      {spec.family === 'ratchet' && (
        <>
          <label className="flex flex-col gap-[3px] items-start text-sm text-text-secondary">
            Sweep
            <select
              className="px-1.5 py-[3px] border border-text-disabled rounded-[3px] text-sm"
              value={spec.sweep}
              onChange={(e) =>
                setSpec({
                  ...spec,
                  sweep: e.target.value as 'baseRate' | 'stepBoost',
                })
              }
            >
              <option value="baseRate">base rate</option>
              <option value="stepBoost">boost per step</option>
            </select>
          </label>
          <PctNum
            label="Step size (% gain per ratchet click)"
            value={spec.stepSize}
            onChange={(stepSize) => setSpec({ ...spec, stepSize })}
          />
          {spec.sweep === 'baseRate' ? (
            <PctNum
              label="Boost per step (%)"
              value={spec.stepBoost}
              onChange={(stepBoost) => setSpec({ ...spec, stepBoost })}
            />
          ) : (
            <PctNum
              label="Base rate (%)"
              value={spec.baseRate}
              onChange={(baseRate) => setSpec({ ...spec, baseRate })}
            />
          )}
          <PctRange
            from={spec.from}
            to={spec.to}
            step={spec.step}
            onChange={(from, to, step) => setSpec({ ...spec, from, to, step })}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List editors — reuse the single-scenario controls per entry.
// ---------------------------------------------------------------------------

function ListEditor({
  dim,
  study,
  update,
  horizonYears,
}: {
  dim: StudyDimension;
  study: StudyConfig;
  update: (p: Partial<StudyConfig>) => void;
  horizonYears: number;
}) {
  if (dim === 'allocation') {
    return (
      <EntryList
        items={study.allocationList}
        onChange={(allocationList) => update({ allocationList })}
        describe={describeAllocation}
        makeNew={() => ({
          type: 'static',
          weights: { stock: 0.6, bond: 0.4, cash: 0 },
        })}
        render={(item, onChange) => (
          <AllocationEditor
            horizonYears={horizonYears}
            allocation={item}
            onChange={onChange}
          />
        )}
      />
    );
  }
  if (dim === 'withdrawal') {
    return (
      <EntryList
        items={study.withdrawalList}
        onChange={(withdrawalList) => update({ withdrawalList })}
        describe={describeWithdrawal}
        makeNew={() => ({ type: 'fixedPercent', rate: 0.04 })}
        render={(item, onChange) => (
          <WithdrawalEditor
            horizonYears={horizonYears}
            withdrawal={item}
            onChange={onChange}
          />
        )}
      />
    );
  }
  return (
    <EntryList
      items={study.sourceList}
      onChange={(sourceList) => update({ sourceList })}
      describe={describeSource}
      makeNew={() => ({ type: 'proportional', rebalance: true })}
      render={(item, onChange) => (
        <WithdrawalSourceInput hideLabel value={item} onChange={onChange} />
      )}
    />
  );
}

function EntryList<T extends AllocationStrategy | WithdrawalStrategy | WithdrawalSource>({
  items,
  onChange,
  describe,
  makeNew,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  describe: (item: T) => string;
  makeNew: () => T;
  render: (item: T, onChange: (next: T) => void) => ReactNode;
}) {
  return (
    <div className="study-list">
      {items.map((item, i) => (
        <div key={i} className="study-list-entry">
          <div className="study-list-entry-head">
            <span>
              {i + 1}. {describe(item)}
            </span>
            <button
              className="x-btn"
              disabled={items.length <= 1}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              title="remove variant"
            >
              ✕
            </button>
          </div>
          {render(item, (next) =>
            onChange(items.map((it, j) => (j === i ? next : it))),
          )}
        </div>
      ))}
      <button
        className="x-btn"
        onClick={() => onChange([...items, makeNew()])}
        style={{ marginTop: 4 }}
      >
        + add variant
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Numeric inputs — display in friendly units, store in engine units.
// ---------------------------------------------------------------------------

const fmtPct = (v: number) => String(+(v * 100).toFixed(4));
const parsePct = (s: string) => { const n = parseFloat(s); return isNaN(n) ? null : n / 100; };
const fmtMarginal = (v: number) => String(+(v * 1000).toFixed(3));
const parseMarginal = (s: string) => { const n = parseFloat(s); return isNaN(n) ? null : n / 1000; };

const axisNumCls = 'w-14 px-[6px] py-[3px] border-[1.5px] border-border-input rounded-md text-base font-[inherit] text-text bg-surface outline-none box-border transition-[border-color,box-shadow] duration-150 focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-ring)] hover:border-border-hover';

function PctRange({
  label,
  from,
  to,
  step,
  onChange,
}: {
  label?: string;
  from: number;
  to: number;
  step: number;
  onChange: (from: number, to: number, step: number) => void;
}) {
  return (
    <div className="flex gap-3 flex-wrap items-center">
      {label && <span className="text-sm font-semibold text-[#444] min-w-[52px]">{label}</span>}
      <label className="flex items-center gap-1 text-sm text-text-secondary">
        from
        <NumericInput
          className={axisNumCls}
          value={from}
          format={fmtPct}
          parse={parsePct}
          onChange={(v) => onChange(v, to, step)}
        />
        %
      </label>
      <label className="flex items-center gap-1 text-sm text-text-secondary">
        to
        <NumericInput
          className={axisNumCls}
          value={to}
          format={fmtPct}
          parse={parsePct}
          onChange={(v) => onChange(from, v, step)}
        />
        %
      </label>
      <label className="flex items-center gap-1 text-sm text-text-secondary">
        step
        <NumericInput
          className={axisNumCls}
          value={step}
          format={fmtPct}
          parse={(s) => { const n = parseFloat(s); return isNaN(n) ? null : Math.max(0.0005, n / 100); }}
          min={0.0005}
          onChange={(v) => onChange(from, to, v)}
        />
        %
      </label>
    </div>
  );
}

function MarginalRange({
  from,
  to,
  step,
  onChange,
}: {
  from: number;
  to: number;
  step: number;
  onChange: (from: number, to: number, step: number) => void;
}) {
  // marginalSpend is stored as $ per $ over initial; display as $k per $1M.
  return (
    <div className="flex gap-3 flex-wrap items-center">
      <label className="flex items-center gap-1 text-sm text-text-secondary">
        from
        <NumericInput
          className={axisNumCls}
          value={from}
          format={fmtMarginal}
          parse={parseMarginal}
          onChange={(v) => onChange(v, to, step)}
        />
        k
      </label>
      <label className="flex items-center gap-1 text-sm text-text-secondary">
        to
        <NumericInput
          className={axisNumCls}
          value={to}
          format={fmtMarginal}
          parse={parseMarginal}
          onChange={(v) => onChange(from, v, step)}
        />
        k
      </label>
      <label className="flex items-center gap-1 text-sm text-text-secondary">
        step
        <NumericInput
          className={axisNumCls}
          value={step}
          format={fmtMarginal}
          parse={(s) => { const n = parseFloat(s); return isNaN(n) ? null : Math.max(0.0005, n / 1000); }}
          min={0.0005}
          onChange={(v) => onChange(from, to, v)}
        />
        k
      </label>
    </div>
  );
}

function PctNum({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-sm text-text-secondary">
      {label}
      <NumericInput
        className={axisNumCls}
        value={value}
        format={fmtPct}
        parse={parsePct}
        onChange={onChange}
      />
    </label>
  );
}

function MarginalNum({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-sm text-text-secondary">
      {label}
      <NumericInput
        className={axisNumCls}
        value={value}
        format={fmtMarginal}
        parse={parseMarginal}
        onChange={onChange}
      />
    </label>
  );
}
