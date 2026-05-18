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

  return (
    <div className="study-panel">
      <div className="study-panel-intro">
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
          <div key={key} className={`study-row${swept ? ' varying' : ''}`}>
            <div className="study-row-head">
              <span className="study-dim-name">
                {label}
                {role && <span className="study-dim-role"> · {role}</span>}
              </span>
              <div className="mode-toggle study-dim-toggle">
                <button
                  className={!swept ? 'active' : ''}
                  onClick={() => setPinned(key)}
                  disabled={swept && sweptCount <= 1}
                  title="Hold this dimension constant"
                >
                  <PinIcon /> pinned
                </button>
                <button
                  className={swept ? 'active' : ''}
                  onClick={() => setSwept(key)}
                  disabled={!swept && sweptCount >= 2}
                  title="Sweep this dimension across many variants"
                >
                  <SweepIcon /> sweep
                </button>
              </div>
            </div>
            <div className="study-row-body">
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
      <div className="mode-toggle study-vary-mode">
        <button
          className={mode === 'range' ? 'active' : ''}
          onClick={() => setMode('range')}
        >
          range
        </button>
        <button
          className={mode === 'list' ? 'active' : ''}
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
    <div className="rule-hint">
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
      <div className="study-range">
        <div className="rule-hint">
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
    <div className="study-range">
      <div className="rule-hint">Race these withdrawal-source strategies:</div>
      {SOURCE_PRESETS.map((p) => (
        <label key={p.id} className="rebalance-row">
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
    <div className="study-range">
      <label className="study-field">
        Family
        <select
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
          <div className="rule-hint">Sweep the fixed withdrawal rate.</div>
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
          <div className="rule-hint">
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
          <label className="study-field">
            Sweep
            <select
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
          <label className="study-field">
            Sweep
            <select
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
    <div className="study-range-row">
      {label && <span className="study-range-label">{label}</span>}
      <label>
        from
        <NumericInput
          className="axis-num"
          value={from}
          format={fmtPct}
          parse={parsePct}
          onChange={(v) => onChange(v, to, step)}
        />
        %
      </label>
      <label>
        to
        <NumericInput
          className="axis-num"
          value={to}
          format={fmtPct}
          parse={parsePct}
          onChange={(v) => onChange(from, v, step)}
        />
        %
      </label>
      <label>
        step
        <NumericInput
          className="axis-num"
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
    <div className="study-range-row">
      <label>
        from
        <NumericInput
          className="axis-num"
          value={from}
          format={fmtMarginal}
          parse={parseMarginal}
          onChange={(v) => onChange(v, to, step)}
        />
        k
      </label>
      <label>
        to
        <NumericInput
          className="axis-num"
          value={to}
          format={fmtMarginal}
          parse={parseMarginal}
          onChange={(v) => onChange(from, v, step)}
        />
        k
      </label>
      <label>
        step
        <NumericInput
          className="axis-num"
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
    <label className="study-field">
      {label}
      <NumericInput
        className="axis-num"
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
    <label className="study-field">
      {label}
      <NumericInput
        className="axis-num"
        value={value}
        format={fmtMarginal}
        parse={parseMarginal}
        onChange={onChange}
      />
    </label>
  );
}
