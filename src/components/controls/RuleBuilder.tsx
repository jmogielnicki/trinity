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
    <div className="flex flex-col gap-2">
      <div className="text-sm text-[#444]">
        Base rate{' '}
        <NumericInput
          className="w-14 px-2 py-[7px] border-[1.5px] border-border-input rounded-md text-base font-[inherit] text-text bg-surface outline-none box-border transition-[border-color,box-shadow] duration-150 focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-ring)] hover:border-border-hover"
          value={base}
          format={fmtPct2}
          parse={parsePct}
          onChange={(v) => onChange(v, rules)}
        />
        % — applied when no rule matches.
      </div>
      <div className="text-xs text-[#777] py-[2px] pb-1">
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
        className="text-sm px-2 py-1 border border-text-disabled bg-surface rounded-[3px] cursor-pointer self-start"
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
        <span>then withdraw</span>
        <NumericInput
          className="w-14 px-2 py-[7px] border-[1.5px] border-border-input rounded-md text-base font-[inherit] text-text bg-surface outline-none box-border transition-[border-color,box-shadow] duration-150 focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-ring)] hover:border-border-hover"
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
        <button className="ml-auto border-none bg-transparent text-[#999] text-base leading-none cursor-pointer px-1 hover:text-[#c33]" onClick={onDelete}>
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
            className="w-14 px-2 py-[7px] border-[1.5px] border-border-input rounded-md text-base font-[inherit] text-text bg-surface outline-none box-border transition-[border-color,box-shadow] duration-150 focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-ring)] hover:border-border-hover"
            value={cond.from}
            format={fmtInt}
            parse={parseIntFn}
            onChange={(v) => onChange({ ...cond, from: v })}
          />
          <span>–</span>
          <NumericInput
            className="w-14 px-2 py-[7px] border-[1.5px] border-border-input rounded-md text-base font-[inherit] text-text bg-surface outline-none box-border transition-[border-color,box-shadow] duration-150 focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-ring)] hover:border-border-hover"
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
            className="w-14 px-2 py-[7px] border-[1.5px] border-border-input rounded-md text-base font-[inherit] text-text bg-surface outline-none box-border transition-[border-color,box-shadow] duration-150 focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-ring)] hover:border-border-hover"
            value={cond.lookback}
            format={fmtInt}
            parse={parseIntFn}
            onChange={(v) => onChange({ ...cond, lookback: v })}
          />
          <span>y ret &gt;</span>
          <NumericInput
            className="w-14 px-2 py-[7px] border-[1.5px] border-border-input rounded-md text-base font-[inherit] text-text bg-surface outline-none box-border transition-[border-color,box-shadow] duration-150 focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-ring)] hover:border-border-hover"
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
            className="w-14 px-2 py-[7px] border-[1.5px] border-border-input rounded-md text-base font-[inherit] text-text bg-surface outline-none box-border transition-[border-color,box-shadow] duration-150 focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-ring)] hover:border-border-hover"
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
            className="w-14 px-2 py-[7px] border-[1.5px] border-border-input rounded-md text-base font-[inherit] text-text bg-surface outline-none box-border transition-[border-color,box-shadow] duration-150 focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-ring)] hover:border-border-hover"
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
