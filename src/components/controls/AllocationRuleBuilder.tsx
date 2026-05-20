import type { Action, Condition, Rule } from '../../engine/rules';
import type { Weights } from '../../engine/types';
import { NumericInput } from './NumericInput';
import { Btn } from '../ui/Btn';
import { GhostDeleteBtn } from '../ui/GhostDeleteBtn';
import { FIELD_SM } from '../ui/fieldCls';

type Props = {
  base: Weights;
  rules: Rule[];
  onChange: (base: Weights, rules: Rule[]) => void;
};

const COND_TYPES: Condition['type'][] = [
  'yearRange',
  'returnAbove',
  'balanceVsInitial',
  'inflationAbove',
];

function defaultRule(): Rule {
  return {
    if: { type: 'balanceVsInitial', ratio: 1, comparator: '<' },
    then: { type: 'shiftAllocation', delta: { stock: -0.1, bond: 0.1, cash: 0 } },
  };
}

const fmtPct0 = (v: number) => (v * 100).toFixed(0);
const parsePct = (s: string) => { const n = parseFloat(s); return isNaN(n) ? null : n / 100; };
const fmtInt = (v: number) => String(Math.round(v));
const parseIntFn = (s: string) => { const n = parseInt(s, 10); return isNaN(n) ? null : n; };
const fmtDec2 = (v: number) => v.toFixed(2);
const parseFloat2 = (s: string) => { const n = parseFloat(s); return isNaN(n) ? null : n; };

/**
 * Visual builder for allocation ruleBased strategies. Conditions match the
 * withdrawal builder; action is `shiftAllocation` with a delta Weights, then
 * normalized + clamped at evaluation time.
 */
export function AllocationRuleBuilder({ base, rules, onChange }: Props) {
  const update = (b: Weights, rs: Rule[]) => onChange(b, rs);

  const updateBase = (k: keyof Weights, v: number) =>
    update({ ...base, [k]: v }, rules);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-text-secondary">
        Base allocation (used when no rule matches; renormalized to 100%):
      </div>
      <div className="text-xs text-text-faint py-0.5 pb-1">
        All matching rules <strong>compound</strong> their delta onto the base each year
        (e.g. two rules that each shift -10% stocks → -20% stocks).
      </div>
      <div className="flex items-center gap-1.5 flex-wrap text-base">
        <span>stocks</span>
        <NumericInput
          className={FIELD_SM}
          value={base.stock}
          format={fmtDec2}
          parse={parseFloat2}
          onChange={(v) => updateBase('stock', v)}
        />
        <span>bonds</span>
        <NumericInput
          className={FIELD_SM}
          value={base.bond}
          format={fmtDec2}
          parse={parseFloat2}
          onChange={(v) => updateBase('bond', v)}
        />
        <span>cash</span>
        <NumericInput
          className={FIELD_SM}
          value={base.cash}
          format={fmtDec2}
          parse={parseFloat2}
          onChange={(v) => updateBase('cash', v)}
        />
      </div>
      {rules.map((r, i) => (
        <RuleRow
          key={i}
          rule={r}
          onDelete={() => update(base, rules.filter((_, j) => j !== i))}
          onChange={(rr) =>
            update(
              base,
              rules.map((x, j) => (i === j ? rr : x)),
            )
          }
        />
      ))}
      <Btn onClick={() => update(base, [...rules, defaultRule()])}>+ add rule</Btn>
    </div>
  );
}

function RuleRow({
  rule,
  onChange,
  onDelete,
}: {
  rule: Rule;
  onChange: (r: Rule) => void;
  onDelete: () => void;
}) {
  const setCondType = (t: Condition['type']) => {
    let cond: Condition;
    switch (t) {
      case 'yearRange': cond = { type: 'yearRange', from: 0, to: 5 }; break;
      case 'returnAbove': cond = { type: 'returnAbove', threshold: 0.1, lookback: 1 }; break;
      case 'balanceVsInitial': cond = { type: 'balanceVsInitial', ratio: 1, comparator: '>' }; break;
      case 'inflationAbove': cond = { type: 'inflationAbove', threshold: 0.05 }; break;
    }
    onChange({ ...rule, if: cond });
  };
  const action = rule.then as Extract<Action, { type: 'shiftAllocation' }>;

  const updateDelta = (k: keyof typeof action.delta, v: number) =>
    onChange({
      ...rule,
      then: { type: 'shiftAllocation', delta: { ...action.delta, [k]: v } },
    });

  return (
    <div className="border border-border-light rounded px-2 py-1.5 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 flex-wrap text-base">
        <span>if</span>
        <select
          className="text-base px-1.5 py-1.5 border-[1.5px] border-border-input rounded-md font-[inherit] text-text bg-surface outline-none"
          value={rule.if.type}
          onChange={(e) => setCondType(e.target.value as Condition['type'])}
        >
          {COND_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <CondInputs cond={rule.if} onChange={(c) => onChange({ ...rule, if: c })} />
      </div>
      <div className="flex items-center gap-1.5 flex-wrap text-base">
        <span>then shift</span>
        <span>stk</span>
        <NumericInput
          className={FIELD_SM}
          value={action.delta.stock}
          format={fmtDec2}
          parse={parseFloat2}
          onChange={(v) => updateDelta('stock', v)}
        />
        <span>bnd</span>
        <NumericInput
          className={FIELD_SM}
          value={action.delta.bond}
          format={fmtDec2}
          parse={parseFloat2}
          onChange={(v) => updateDelta('bond', v)}
        />
        <span>csh</span>
        <NumericInput
          className={FIELD_SM}
          value={action.delta.cash}
          format={fmtDec2}
          parse={parseFloat2}
          onChange={(v) => updateDelta('cash', v)}
        />
        <GhostDeleteBtn onClick={onDelete} />
      </div>
    </div>
  );
}

function CondInputs({
  cond,
  onChange,
}: {
  cond: Condition;
  onChange: (c: Condition) => void;
}) {
  switch (cond.type) {
    case 'yearRange':
      return (
        <>
          <span>year</span>
          <NumericInput
            className={FIELD_SM}
            value={cond.from}
            format={fmtInt}
            parse={parseIntFn}
            onChange={(v) => onChange({ ...cond, from: v })}
          />
          <span>–</span>
          <NumericInput
            className={FIELD_SM}
            value={cond.to}
            format={fmtInt}
            parse={parseIntFn}
            onChange={(v) => onChange({ ...cond, to: v })}
          />
        </>
      );
    case 'returnAbove':
      return (
        <>
          <span>last</span>
          <NumericInput
            className={FIELD_SM}
            value={cond.lookback}
            format={fmtInt}
            parse={parseIntFn}
            onChange={(v) => onChange({ ...cond, lookback: v })}
          />
          <span>y ret &gt;</span>
          <NumericInput
            className={FIELD_SM}
            value={cond.threshold}
            format={fmtPct0}
            parse={parsePct}
            onChange={(v) => onChange({ ...cond, threshold: v })}
          />
          <span>%</span>
        </>
      );
    case 'balanceVsInitial':
      return (
        <>
          <span>balance/initial</span>
          <select
            className="text-base px-1.5 py-1.5 border-[1.5px] border-border-input rounded-md font-[inherit] text-text bg-surface outline-none"
            value={cond.comparator}
            onChange={(e) =>
              onChange({ ...cond, comparator: e.target.value as '>' | '<' })
            }
          >
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
          </select>
          <NumericInput
            className={FIELD_SM}
            value={cond.ratio}
            onChange={(v) => onChange({ ...cond, ratio: v })}
          />
        </>
      );
    case 'inflationAbove':
      return (
        <>
          <span>inflation &gt;</span>
          <NumericInput
            className={FIELD_SM}
            value={cond.threshold}
            format={fmtPct0}
            parse={parsePct}
            onChange={(v) => onChange({ ...cond, threshold: v })}
          />
          <span>%</span>
        </>
      );
  }
}
