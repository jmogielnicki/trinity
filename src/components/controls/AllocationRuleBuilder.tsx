import type { Action, Condition, Rule } from '../../engine/rules';
import type { Weights } from '../../engine/types';

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
    <div className="control-group">
      <div className="control-label">
        Base allocation (used when no rule matches; renormalized to 100%):
      </div>
      <div className="rule-line">
        <span>stocks</span>
        <input
          type="number"
          className="axis-num"
          step={0.05}
          value={base.stock}
          onChange={(e) => updateBase('stock', +e.target.value)}
        />
        <span>bonds</span>
        <input
          type="number"
          className="axis-num"
          step={0.05}
          value={base.bond}
          onChange={(e) => updateBase('bond', +e.target.value)}
        />
        <span>cash</span>
        <input
          type="number"
          className="axis-num"
          step={0.05}
          value={base.cash}
          onChange={(e) => updateBase('cash', +e.target.value)}
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
      <button
        className="apply-btn"
        onClick={() => update(base, [...rules, defaultRule()])}
      >
        + add rule
      </button>
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
    <div className="rule-row">
      <div className="rule-line">
        <span>if</span>
        <select
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
      <div className="rule-line">
        <span>then shift</span>
        <span>stk</span>
        <input
          type="number"
          className="axis-num"
          step={0.05}
          value={action.delta.stock}
          onChange={(e) => updateDelta('stock', +e.target.value)}
        />
        <span>bnd</span>
        <input
          type="number"
          className="axis-num"
          step={0.05}
          value={action.delta.bond}
          onChange={(e) => updateDelta('bond', +e.target.value)}
        />
        <span>csh</span>
        <input
          type="number"
          className="axis-num"
          step={0.05}
          value={action.delta.cash}
          onChange={(e) => updateDelta('cash', +e.target.value)}
        />
        <button className="x-btn" onClick={onDelete}>×</button>
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
          <input
            type="number"
            className="axis-num"
            value={cond.from}
            onChange={(e) => onChange({ ...cond, from: +e.target.value })}
          />
          <span>–</span>
          <input
            type="number"
            className="axis-num"
            value={cond.to}
            onChange={(e) => onChange({ ...cond, to: +e.target.value })}
          />
        </>
      );
    case 'returnAbove':
      return (
        <>
          <span>last</span>
          <input
            type="number"
            className="axis-num"
            value={cond.lookback}
            onChange={(e) => onChange({ ...cond, lookback: +e.target.value })}
          />
          <span>y ret &gt;</span>
          <input
            type="number"
            className="axis-num"
            step={1}
            value={(cond.threshold * 100).toFixed(0)}
            onChange={(e) =>
              onChange({ ...cond, threshold: Number(e.target.value) / 100 })
            }
          />
          <span>%</span>
        </>
      );
    case 'balanceVsInitial':
      return (
        <>
          <span>balance/initial</span>
          <select
            value={cond.comparator}
            onChange={(e) =>
              onChange({ ...cond, comparator: e.target.value as '>' | '<' })
            }
          >
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
          </select>
          <input
            type="number"
            className="axis-num"
            step={0.1}
            value={cond.ratio}
            onChange={(e) => onChange({ ...cond, ratio: +e.target.value })}
          />
        </>
      );
    case 'inflationAbove':
      return (
        <>
          <span>inflation &gt;</span>
          <input
            type="number"
            className="axis-num"
            step={1}
            value={(cond.threshold * 100).toFixed(0)}
            onChange={(e) =>
              onChange({ ...cond, threshold: Number(e.target.value) / 100 })
            }
          />
          <span>%</span>
        </>
      );
  }
}
