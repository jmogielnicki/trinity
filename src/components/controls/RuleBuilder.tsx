import type { Action, Condition, Rule } from '../../engine/rules';
import { NumericInput } from './NumericInput';

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

const fmtPct2 = (v: number) => (v * 100).toFixed(2);
const fmtPct0 = (v: number) => (v * 100).toFixed(0);
const parsePct = (s: string) => { const n = parseFloat(s); return isNaN(n) ? null : n / 100; };
const fmtInt = (v: number) => String(Math.round(v));
const parseIntFn = (s: string) => { const n = parseInt(s, 10); return isNaN(n) ? null : n; };

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
        <NumericInput
          className="axis-num"
          value={base}
          format={fmtPct2}
          parse={parsePct}
          onChange={(v) => onChange(v, rules)}
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
        <NumericInput
          className="axis-num"
          value={action.rate}
          format={fmtPct2}
          parse={parsePct}
          onChange={(v) =>
            onChange({
              ...rule,
              then: { type: 'setWithdrawal', rate: v },
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
          <NumericInput
            className="axis-num"
            value={cond.from}
            format={fmtInt}
            parse={parseIntFn}
            onChange={(v) => onChange({ ...cond, from: v })}
          />
          <span>–</span>
          <NumericInput
            className="axis-num"
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
            className="axis-num"
            value={cond.lookback}
            format={fmtInt}
            parse={parseIntFn}
            onChange={(v) => onChange({ ...cond, lookback: v })}
          />
          <span>y ret &gt;</span>
          <NumericInput
            className="axis-num"
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
            value={cond.comparator}
            onChange={(e) =>
              onChange({ ...cond, comparator: e.target.value as '>' | '<' })
            }
          >
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
          </select>
          <NumericInput
            className="axis-num"
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
            className="axis-num"
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
