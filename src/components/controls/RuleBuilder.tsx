import type { Action, Condition, Rule } from '../../engine/rules';

type Props = {
  base: number;
  rules: Rule[];
  onChange: (base: number, rules: Rule[]) => void;
};

const COND_TYPES: Condition['type'][] = [
  'yearRange',
  'returnAbove',
  'balanceVsInitial',
  'inflationAbove',
];

function defaultRule(): Rule {
  return {
    if: { type: 'yearRange', from: 0, to: 5 },
    then: { type: 'setWithdrawal', rate: 0.05 },
  };
}

/**
 * Visual builder for a withdrawal ruleBased strategy. Rules execute in
 * order; each matching one overwrites the rate. The `base` is the default
 * when nothing matches.
 */
export function RuleBuilder({ base, rules, onChange }: Props) {
  const update = (newRules: Rule[]) => onChange(base, newRules);

  return (
    <div className="control-group">
      <div className="control-label">
        Base rate{' '}
        <input
          type="number"
          className="axis-num"
          step={0.0025}
          value={(base * 100).toFixed(2)}
          onChange={(e) => onChange(Number(e.target.value) / 100, rules)}
        />
        % — applied when no rule matches.
      </div>
      <div className="rule-hint">
        Rules evaluate top-down each year; the <strong>last matching rule wins</strong>
        and overrides the rate.
      </div>
      {rules.map((r, i) => (
        <RuleRow
          key={i}
          rule={r}
          onDelete={() => update(rules.filter((_, j) => j !== i))}
          onChange={(rr) => update(rules.map((x, j) => (i === j ? rr : x)))}
        />
      ))}
      <button
        className="apply-btn"
        onClick={() => update([...rules, defaultRule()])}
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

  const action = rule.then as Extract<Action, { type: 'setWithdrawal' }>;

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
        <span>then withdraw</span>
        <input
          type="number"
          className="axis-num"
          step={0.25}
          value={(action.rate * 100).toFixed(2)}
          onChange={(e) =>
            onChange({
              ...rule,
              then: { type: 'setWithdrawal', rate: Number(e.target.value) / 100 },
            })
          }
        />
        <span>%</span>
        <button className="x-btn" onClick={onDelete}>
          ×
        </button>
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
