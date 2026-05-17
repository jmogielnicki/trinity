import type { ReactNode } from 'react';
import type { AllocationStrategy, WithdrawalStrategy } from '../../engine/strategies';
import type { WithdrawalSource } from '../../engine/withdrawalSource';
import {
  SOURCE_PRESETS,
  describeAllocation,
  describeSource,
  describeWithdrawal,
  rangeValues,
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
  { key: 'withdrawal', label: 'Withdrawal rate' },
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

export function StudyConfigPanel() {
  const { study, setStudy } = useOptimizeStore();
  const horizonYears = useScenarioStore((s) => s.horizonYears);
  const update = (patch: Partial<StudyConfig>) => setStudy({ ...study, ...patch });

  return (
    <div className="study-panel">
      <div className="study-panel-intro">
        Pin two dimensions, sweep the third. Every variant runs against all
        historical start years; compare them below.
      </div>
      {DIMENSIONS.map(({ key, label }) => {
        const varying = study.varying === key;
        return (
          <div key={key} className={`study-row${varying ? ' varying' : ''}`}>
            <div className="study-row-head">
              <span className="study-dim-name">{label}</span>
              <div className="mode-toggle study-dim-toggle">
                <button
                  className={!varying ? 'active' : ''}
                  onClick={() => {
                    if (varying) return;
                    // Make some other dimension vary instead so exactly one
                    // is always swept; pick the first that isn't this one.
                    const next = DIMENSIONS.find((d) => d.key !== key)!.key;
                    update({ varying: next });
                  }}
                  title="Pin this dimension to a single value"
                >
                  📌 locked
                </button>
                <button
                  className={varying ? 'active' : ''}
                  onClick={() => update({ varying: key })}
                  title="Sweep this dimension across many variants"
                >
                  ↔ sweep
                </button>
              </div>
            </div>
            <div className="study-row-body">
              {varying ? (
                <VaryEditor study={study} update={update} horizonYears={horizonYears} />
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
  study,
  update,
  horizonYears,
}: {
  study: StudyConfig;
  update: (p: Partial<StudyConfig>) => void;
  horizonYears: number;
}) {
  return (
    <>
      <div className="mode-toggle study-vary-mode">
        <button
          className={study.varyMode === 'range' ? 'active' : ''}
          onClick={() => update({ varyMode: 'range' })}
        >
          range
        </button>
        <button
          className={study.varyMode === 'list' ? 'active' : ''}
          onClick={() => update({ varyMode: 'list' })}
        >
          hand-picked list
        </button>
      </div>
      {study.varyMode === 'range' ? (
        <RangeEditor study={study} update={update} />
      ) : (
        <ListEditor study={study} update={update} horizonYears={horizonYears} />
      )}
      <VariantCount study={study} />
    </>
  );
}

function VariantCount({ study }: { study: StudyConfig }) {
  let n: number;
  if (study.varyMode === 'list') {
    n =
      study.varying === 'allocation'
        ? study.allocationList.length
        : study.varying === 'withdrawal'
          ? study.withdrawalList.length
          : study.sourceList.length;
  } else if (study.varying === 'allocation') {
    const r = study.allocationRange;
    n = rangeValues(r.fromStock, r.toStock, r.step).length;
  } else if (study.varying === 'withdrawal') {
    const r = study.withdrawalRange;
    n = rangeValues(r.from, r.to, r.step).length;
  } else {
    n = study.sourcePresetIds.length;
  }
  return <div className="rule-hint">{n} variant{n === 1 ? '' : 's'} will run.</div>;
}

// ---------------------------------------------------------------------------
// Range editors
// ---------------------------------------------------------------------------

function RangeEditor({
  study,
  update,
}: {
  study: StudyConfig;
  update: (p: Partial<StudyConfig>) => void;
}) {
  if (study.varying === 'allocation') {
    const r = study.allocationRange;
    return (
      <div className="study-range">
        <div className="rule-hint">Static stock allocation; bonds take the rest.</div>
        <PctRange
          from={r.fromStock}
          to={r.toStock}
          step={r.step}
          onChange={(fromStock, toStock, step) =>
            update({ allocationRange: { fromStock, toStock, step } })
          }
        />
      </div>
    );
  }
  if (study.varying === 'withdrawal') {
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
  study,
  update,
  horizonYears,
}: {
  study: StudyConfig;
  update: (p: Partial<StudyConfig>) => void;
  horizonYears: number;
}) {
  if (study.varying === 'allocation') {
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
  if (study.varying === 'withdrawal') {
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

function PctRange({
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
  return (
    <div className="study-range-row">
      <label>
        from
        <input
          type="number"
          className="axis-num"
          value={+(from * 100).toFixed(4)}
          step={0.25}
          onChange={(e) => onChange((+e.target.value || 0) / 100, to, step)}
        />
        %
      </label>
      <label>
        to
        <input
          type="number"
          className="axis-num"
          value={+(to * 100).toFixed(4)}
          step={0.25}
          onChange={(e) => onChange(from, (+e.target.value || 0) / 100, step)}
        />
        %
      </label>
      <label>
        step
        <input
          type="number"
          className="axis-num"
          value={+(step * 100).toFixed(4)}
          step={0.05}
          min={0.05}
          onChange={(e) =>
            onChange(from, to, Math.max(0.0005, (+e.target.value || 0) / 100))
          }
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
        <input
          type="number"
          className="axis-num"
          value={+(from * 1000).toFixed(3)}
          step={1}
          onChange={(e) => onChange((+e.target.value || 0) / 1000, to, step)}
        />
        k
      </label>
      <label>
        to
        <input
          type="number"
          className="axis-num"
          value={+(to * 1000).toFixed(3)}
          step={1}
          onChange={(e) => onChange(from, (+e.target.value || 0) / 1000, step)}
        />
        k
      </label>
      <label>
        step
        <input
          type="number"
          className="axis-num"
          value={+(step * 1000).toFixed(3)}
          step={0.5}
          min={0.5}
          onChange={(e) =>
            onChange(from, to, Math.max(0.0005, (+e.target.value || 0) / 1000))
          }
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
      <input
        type="number"
        className="axis-num"
        value={+(value * 100).toFixed(4)}
        step={0.25}
        onChange={(e) => onChange((+e.target.value || 0) / 100)}
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
      <input
        type="number"
        className="axis-num"
        value={+(value * 1000).toFixed(3)}
        step={1}
        onChange={(e) => onChange((+e.target.value || 0) / 1000)}
      />
    </label>
  );
}
