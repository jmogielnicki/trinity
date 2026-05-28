import type { ReactNode } from 'react';
import type { AllocationStrategy, WithdrawalStrategy } from '../../engine/strategies';
import type { WithdrawalSource } from '../../engine/withdrawalSource';
import { Fragment } from 'react';
import { NumericInput } from '../controls/NumericInput';
import { TabBar } from '../ui/TabBar';
import { ToggleButton } from '../ui/ToggleButton';
import { FIELD_AXIS } from '../ui/fieldCls';
import {
  SOURCE_PRESETS,
  WITHDRAWAL_ARCHETYPES,
  WITHDRAWAL_EDITOR_UNSUPPORTED,
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
import {
  allocRows,
  allocTypeName,
  srcRows,
  srcTypeName,
  wdRows,
  wdTypeName,
} from '../../engine/strategyDescriptions';
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
  floorAndUpside: 'Floor + upside',
  ratchet: 'Ratchet',
  curve: 'Curve',
  cape: 'CAPE',
};

function familyDefault(family: WithdrawalFamily): WithdrawalRangeSpec {
  switch (family) {
    case 'fixedPercent':
      return { family, from: 0.03, to: 0.06, step: 0.0025 };
    case 'floorAndUpside':
      return {
        family,
        sweep: 'floor',
        floor: 0.0325,
        upsideRate: 0.03,
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
    case 'curve':
      // shift defaults: ±1% around a 3.5%→4.5% baseline ramp over 30 years.
      return {
        family,
        sweep: 'shift',
        startRate: 0.035,
        endRate: 0.045,
        transitionYears: 30,
        from: -0.01,
        to: 0.01,
        step: 0.0025,
      };
    case 'cape':
      // Default sweep on `a` from 1% to 2.5%, b pinned at 0.5, fallback CAPE 20.
      return {
        family,
        sweep: 'a',
        a: 0.0175,
        b: 0.5,
        fallbackCape: 20,
        from: 0.01,
        to: 0.025,
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

  const toggleSwept = (key: StudyDimension) => {
    // Single-button toggle with radio semantics: clicking a pinned card sweeps
    // it (replacing whatever else was swept); clicking the swept card pins it
    // again (leaves zero swept; user has to pick another to enable Run).
    if (study.varying.includes(key)) {
      update({ varying: study.varying.filter((d) => d !== key) });
    } else {
      update({ varying: [key] });
    }
  };

  const TOGGLE_BASE = 'inline-flex items-center gap-1 px-2 py-[5px] rounded text-xs font-medium cursor-pointer transition-colors';
  const TOGGLE_PINNED = `${TOGGLE_BASE} text-text-muted bg-surface border border-border hover:bg-surface-hover hover:text-text-secondary`;
  const TOGGLE_SWEEP = `${TOGGLE_BASE} text-white bg-primary border border-primary hover:brightness-110`;

  return (
    <div className="flex flex-col gap-2 border border-border rounded-md p-3 bg-surface-page">
      {sweptCount === 0 ? (
        <div className="text-sm text-primary leading-[1.4] font-medium">
          Click{' '}
          <span className="inline-flex items-center gap-1 align-text-bottom">
            <SweepIcon />
            <strong>sweep</strong>
          </span>{' '}
          on one dimension below to choose what to vary across the study. The
          other two stay pinned at the baseline above.
        </div>
      ) : (
        <div className="text-sm text-text-muted leading-[1.4]">
          One dimension sweeps across many variants; the other two stay pinned
          at the baseline above. Click another dimension's{' '}
          <span className="inline-flex items-center gap-1 align-text-bottom">
            <SweepIcon />
            <strong>sweep</strong>
          </span>{' '}
          to switch what's being varied.
        </div>
      )}
      <div className="grid grid-cols-1 min-[950px]:grid-cols-3 gap-2 items-start">
        {DIMENSIONS.map(({ key, label }) => {
        const swept = study.varying.includes(key);
        return (
          <div key={key} className={`border rounded-[5px] bg-surface px-2.5 py-2${swept ? ' border-primary shadow-[0_0_0_1px_var(--color-primary)_inset]' : ' border-border'}`}>
            <div className="flex justify-between items-center gap-3">
              <span className="text-base font-semibold text-text-body">
                {label}
              </span>
              <button
                type="button"
                onClick={() => toggleSwept(key)}
                className={swept ? TOGGLE_SWEEP : TOGGLE_PINNED}
                title={
                  swept
                    ? 'This dimension sweeps across many variants. Click to pin it.'
                    : 'This dimension is held constant. Click to sweep it instead.'
                }
              >
                {swept ? (
                  <>
                    <SweepIcon /> sweep
                  </>
                ) : (
                  <>
                    <PinIcon /> pinned
                  </>
                )}
              </button>
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
                <PinnedSummary dim={key} study={study} />
              )}
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pinned dimension summary — view-only. Editing the baseline happens in the
// Build tab, then the user re-picks (or saves) to bring it back here.
// ---------------------------------------------------------------------------

function PinnedSummary({ dim, study }: { dim: StudyDimension; study: StudyConfig }) {
  const { typeName, rows } =
    dim === 'allocation'
      ? { typeName: allocTypeName(study.lockedAllocation), rows: allocRows(study.lockedAllocation) }
      : dim === 'withdrawal'
        ? { typeName: wdTypeName(study.lockedWithdrawal), rows: wdRows(study.lockedWithdrawal) }
        : { typeName: srcTypeName(study.lockedSource), rows: srcRows(study.lockedSource) };

  return (
    <div className="text-sm">
      <div className="text-text-secondary font-medium mb-1.5">{typeName}</div>
      {rows.length > 0 ? (
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 items-baseline">
          {rows.map(([k, v]) => (
            <Fragment key={k}>
              <div className="text-text-muted text-xs">{k}</div>
              <div className="text-text text-xs font-medium">{v}</div>
            </Fragment>
          ))}
        </div>
      ) : null}
    </div>
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
      <div className="mb-2">
        <TabBar>
          <ToggleButton active={mode === 'range'} onClick={() => setMode('range')}>
            range
          </ToggleButton>
          <ToggleButton active={mode === 'list'} onClick={() => setMode('list')}>
            hand-picked list
          </ToggleButton>
        </TabBar>
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
    <div className="text-xs text-text-faint py-0.5 pb-1">
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
        <div className="text-xs text-text-faint py-0.5 pb-1">
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
      <div className="text-xs text-text-faint py-0.5 pb-1">Race these withdrawal-source strategies:</div>
      {SOURCE_PRESETS.map((p) => (
        <label key={p.id} className="flex items-center gap-1.5 text-sm text-text-secondary">
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
          <div className="text-xs text-text-faint py-0.5 pb-1">Sweep the fixed withdrawal rate.</div>
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

      {spec.family === 'curve' && (
        <>
          <label className="flex flex-col gap-[3px] items-start text-sm text-text-secondary">
            Sweep
            <select
              className="px-1.5 py-[3px] border border-text-disabled rounded-[3px] text-sm"
              value={spec.sweep}
              onChange={(e) => {
                const sweep = e.target.value as 'shift' | 'scale';
                // Reset range — shift uses ±deltas (rate units),
                // scale uses multipliers (~1).
                const range =
                  sweep === 'shift'
                    ? { from: -0.01, to: 0.01, step: 0.0025 }
                    : { from: 0.8, to: 1.2, step: 0.05 };
                setSpec({ ...spec, sweep, ...range });
              }}
            >
              <option value="shift">shift (+delta to both rates)</option>
              <option value="scale">scale (×k to both rates)</option>
            </select>
          </label>
          <div className="text-xs text-text-faint py-0.5">
            Baseline ramp: <strong>{(spec.startRate * 100).toFixed(2)}%</strong> at
            year 0 → <strong>{(spec.endRate * 100).toFixed(2)}%</strong> at year
            {' '}{spec.transitionYears}. Each variant perturbs both rates.
          </div>
          <div className="flex gap-3 flex-wrap">
            <PctNum
              label="Start rate"
              value={spec.startRate}
              onChange={(startRate) => setSpec({ ...spec, startRate })}
            />
            <PctNum
              label="End rate"
              value={spec.endRate}
              onChange={(endRate) => setSpec({ ...spec, endRate })}
            />
            <label className="flex items-center gap-1 text-sm text-text-secondary">
              over
              <NumericInput
                className={axisNumCls}
                value={spec.transitionYears}
                format={(v) => String(Math.round(v))}
                parse={(s) => {
                  const n = parseInt(s, 10);
                  return isNaN(n) ? null : Math.max(1, n);
                }}
                min={1}
                onChange={(transitionYears) => setSpec({ ...spec, transitionYears })}
              />
              yr
            </label>
          </div>
          <PctRange
            from={spec.from}
            to={spec.to}
            step={spec.step}
            onChange={(from, to, step) => setSpec({ ...spec, from, to, step })}
          />
        </>
      )}

      {spec.family === 'cape' && (
        <>
          <label className="flex flex-col gap-[3px] items-start text-sm text-text-secondary">
            Sweep
            <select
              className="px-1.5 py-[3px] border border-text-disabled rounded-[3px] text-sm"
              value={spec.sweep}
              onChange={(e) => {
                const sweep = e.target.value as 'a' | 'b';
                const range =
                  sweep === 'a'
                    ? { from: 0.01, to: 0.025, step: 0.0025 }
                    : { from: 0.25, to: 1.0, step: 0.1 };
                setSpec({ ...spec, sweep, ...range });
              }}
            >
              <option value="a">a (constant baseline)</option>
              <option value="b">b (sensitivity to 1/CAPE)</option>
            </select>
          </label>
          <div className="text-xs text-text-faint py-0.5">
            Rate = a + b / CAPE. Pre-1881 falls back to a + b /{' '}
            {spec.fallbackCape}.
          </div>
          {spec.sweep === 'a' ? (
            <PctNum
              label="b (pinned)"
              value={spec.b}
              onChange={(b) => setSpec({ ...spec, b })}
            />
          ) : (
            <PctNum
              label="a (pinned)"
              value={spec.a}
              onChange={(a) => setSpec({ ...spec, a })}
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
                  sweep: e.target.value as 'floor' | 'upsideRate',
                })
              }
            >
              <option value="floor">floor %</option>
              <option value="upsideRate">upside rate</option>
            </select>
          </label>
          {spec.sweep === 'floor' ? (
            <>
              <PctNum
                label="Upside rate (% of current balance)"
                value={spec.upsideRate}
                onChange={(upsideRate) => setSpec({ ...spec, upsideRate })}
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
              <PctRange
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
      <div className="flex flex-col gap-1.5">
        <div className="text-xs text-text-faint">
          Race different withdrawal families against each other — add any mix
          of archetypes below, then tune the ones that support it.
        </div>
        <EntryList
          items={study.withdrawalList}
          onChange={(withdrawalList) => update({ withdrawalList })}
          describe={describeWithdrawal}
          makeNew={() => ({ type: 'fixedPercent', rate: 0.04 })}
          addPalette={WITHDRAWAL_ARCHETYPES.map((a) => ({
            id: a.id,
            label: a.label,
            make: a.make,
          }))}
          render={(item, onChange) =>
            WITHDRAWAL_EDITOR_UNSUPPORTED.has(item.type) ? (
              <div className="text-xs text-text-faint py-1">
                Runs with its standard parameters (not tunable here).
              </div>
            ) : (
              <WithdrawalEditor
                horizonYears={horizonYears}
                withdrawal={item}
                onChange={onChange}
              />
            )
          }
        />
      </div>
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
  addPalette,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  describe: (item: T) => string;
  makeNew: () => T;
  render: (item: T, onChange: (next: T) => void) => ReactNode;
  /** When set, the add control is a palette of typed building blocks. */
  addPalette?: Array<{ id: string; label: string; make: () => T }>;
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
      {addPalette ? (
        <div className="flex flex-wrap gap-1.5" style={{ marginTop: 4 }}>
          {addPalette.map((p) => (
            <button
              key={p.id}
              className="x-btn"
              onClick={() => onChange([...items, p.make()])}
              title={`Add ${p.label}`}
            >
              + {p.label}
            </button>
          ))}
        </div>
      ) : (
        <button
          className="x-btn"
          onClick={() => onChange([...items, makeNew()])}
          style={{ marginTop: 4 }}
        >
          + add variant
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Numeric inputs — display in friendly units, store in engine units.
// ---------------------------------------------------------------------------

const fmtPct = (v: number) => String(+(v * 100).toFixed(4));
const parsePct = (s: string) => { const n = parseFloat(s); return isNaN(n) ? null : n / 100; };

const axisNumCls = FIELD_AXIS;

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
      {label && <span className="text-sm font-semibold text-text-secondary min-w-[52px]">{label}</span>}
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

