import type { WithdrawalStrategy } from '../../engine/strategies';
import { CustomScriptEditor } from './CustomScriptEditor';
import { NumericInput } from './NumericInput';
import { RuleBuilder } from './RuleBuilder';
import { WithdrawalCurve } from './WithdrawalCurve';

type Mode = 'curve' | 'floor-upside' | 'ratchet' | 'cape' | 'rules' | 'script';

type Props = {
  horizonYears: number;
  withdrawal: WithdrawalStrategy;
  onChange: (w: WithdrawalStrategy) => void;
};

function modeOf(w: WithdrawalStrategy): Mode {
  if (w.type === 'ruleBased') return 'rules';
  if (w.type === 'customSrc' || w.type === 'custom') return 'script';
  if (w.type === 'floorAndUpside') return 'floor-upside';
  if (w.type === 'ratchet') return 'ratchet';
  if (w.type === 'capeWithdrawal') return 'cape';
  // 'curve' covers fixedPercent, piecewiseLinear (what the editor emits),
  // and the legacy 'piecewise' (kept as a separate engine type so old
  // saved scenarios still resolve).
  return 'curve';
}

const DEFAULT_SCRIPT = `// real-dollar withdrawal each year
// state.t = year index, state.balance = current $
// initial = starting balance
return 0.04 * initial;`;

export function WithdrawalEditor({ horizonYears, withdrawal, onChange }: Props) {
  const mode = modeOf(withdrawal);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    if (m === 'curve') onChange({ type: 'fixedPercent', rate: 0.04 });
    if (m === 'rules')
      onChange({
        type: 'ruleBased',
        base: 0.04,
        rules: [
          {
            if: { type: 'yearRange', from: 0, to: 5 },
            then: { type: 'setWithdrawal', rate: 0.035 },
          },
        ],
      });
    if (m === 'script') onChange({ type: 'customSrc', src: DEFAULT_SCRIPT });
    if (m === 'floor-upside')
      onChange({
        type: 'floorAndUpside',
        floor: 0.04,
        marginalSpend: 0.02,
      });
    if (m === 'ratchet')
      onChange({
        type: 'ratchet',
        baseRate: 0.04,
        stepSize: 0.10,
        stepBoost: 0.05,
      });
    if (m === 'cape')
      onChange({ type: 'capeWithdrawal', a: 0.0175, b: 0.5, fallbackCape: 20 });
  };

  return (
    <div className="editor-block">
      <ModeToggle current={mode} onChange={switchMode} />
      {mode === 'curve' && (
        <WithdrawalCurve
          horizonYears={horizonYears}
          withdrawal={withdrawal}
          onChange={onChange}
        />
      )}
      {mode === 'ratchet' && withdrawal.type === 'ratchet' && (
        <RatchetEditor
          baseRate={withdrawal.baseRate}
          stepSize={withdrawal.stepSize}
          stepBoost={withdrawal.stepBoost}
          onChange={(baseRate, stepSize, stepBoost) =>
            onChange({ type: 'ratchet', baseRate, stepSize, stepBoost })
          }
        />
      )}
      {mode === 'floor-upside' && withdrawal.type === 'floorAndUpside' && (
        <FloorUpsideEditor
          floor={withdrawal.floor}
          marginalSpend={withdrawal.marginalSpend}
          onChange={(floor, marginalSpend) =>
            onChange({ type: 'floorAndUpside', floor, marginalSpend })
          }
        />
      )}
      {mode === 'cape' && withdrawal.type === 'capeWithdrawal' && (
        <CapeWithdrawalEditor
          a={withdrawal.a}
          b={withdrawal.b}
          fallbackCape={withdrawal.fallbackCape}
          onChange={(a, b, fallbackCape) =>
            onChange({ type: 'capeWithdrawal', a, b, fallbackCape })
          }
        />
      )}
      {mode === 'rules' && withdrawal.type === 'ruleBased' && (
        <RuleBuilder
          base={withdrawal.base}
          rules={withdrawal.rules}
          onChange={(base, rules) => onChange({ type: 'ruleBased', base, rules })}
        />
      )}
      {mode === 'script' && (
        <CustomScriptEditor
          label="Withdrawal script — return real $ to withdraw."
          signature="state, initial"
          initial={
            withdrawal.type === 'customSrc' ? withdrawal.src : DEFAULT_SCRIPT
          }
          onChange={(src) => onChange({ type: 'customSrc', src })}
        />
      )}
    </div>
  );
}

function ModeToggle({
  current,
  onChange,
}: {
  current: Mode;
  onChange: (m: Mode) => void;
}) {
  const modes: Array<{ k: Mode; label: string }> = [
    { k: 'curve', label: 'curve' },
    { k: 'floor-upside', label: 'floor + upside' },
    { k: 'ratchet', label: 'ratchet' },
    { k: 'cape', label: 'CAPE' },
    { k: 'rules', label: 'rules' },
    { k: 'script', label: 'script' },
  ];
  return (
    <div className="mode-toggle">
      {modes.map((m) => (
        <button
          key={m.k}
          className={current === m.k ? 'active' : ''}
          onClick={() => onChange(m.k)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function CapeWithdrawalEditor({
  a,
  b,
  fallbackCape,
  onChange,
}: {
  a: number;
  b: number;
  fallbackCape: number;
  onChange: (a: number, b: number, fallbackCape: number) => void;
}) {
  const exampleCape = 20.9;
  const exampleRate = (a + b / exampleCape) * 100;
  const pctFmt = (v: number) => (v * 100).toFixed(2).replace(/\.?0+$/, '');
  const pctParse = (s: string) => {
    if (s.trim() === '') return null;
    const n = parseFloat(s);
    return isNaN(n) ? null : Math.max(0, n / 100);
  };
  return (
    <div className="floor-upside-editor">
      <div className="floor-upside-hint">
        Each year: withdraw <strong>rate × current balance</strong>, where{' '}
        <strong>rate = a + b ÷ CAPE</strong>. At CAPE {exampleCape.toFixed(1)},{' '}
        rate = {exampleRate.toFixed(2)}%. Adjusts automatically as markets move.
      </div>
      <div className="floor-upside-grid">
        <label>
          a — base rate (%)
          <NumericInput
            value={a}
            format={pctFmt}
            parse={pctParse}
            min={0}
            max={0.1}
            onChange={(v) => onChange(v, b, fallbackCape)}
          />
        </label>
        <label>
          b — CAPE sensitivity
          <NumericInput
            value={b}
            format={(v) => v.toFixed(2).replace(/\.?0+$/, '')}
            parse={(s) => {
              if (s.trim() === '') return null;
              const n = parseFloat(s);
              return isNaN(n) ? null : Math.max(0, n);
            }}
            min={0}
            max={2}
            onChange={(v) => onChange(a, v, fallbackCape)}
          />
        </label>
        <label>
          Fallback CAPE (pre-1881)
          <NumericInput
            value={fallbackCape}
            format={(v) => String(v)}
            parse={(s) => {
              if (s.trim() === '') return null;
              const n = parseInt(s, 10);
              return isNaN(n) ? null : n;
            }}
            min={5}
            max={60}
            onChange={(v) => onChange(a, b, v)}
          />
        </label>
      </div>
    </div>
  );
}

function RatchetEditor({
  baseRate,
  stepSize,
  stepBoost,
  onChange,
}: {
  baseRate: number;
  stepSize: number;
  stepBoost: number;
  onChange: (baseRate: number, stepSize: number, stepBoost: number) => void;
}) {
  const exampleSteps = Math.floor(0.20 / stepSize);
  const exampleWd = (baseRate * Math.pow(1 + stepBoost, exampleSteps) * 100).toFixed(2);
  const pctFmt = (v: number) => (v * 100).toFixed(2).replace(/\.?0+$/, '');
  const pctParse = (s: string) => {
    if (s.trim() === '') return null;
    const n = parseFloat(s);
    return isNaN(n) ? null : Math.max(0, n / 100);
  };
  return (
    <div className="floor-upside-editor">
      <div className="floor-upside-hint">
        Start at <strong>base rate</strong>. Each time the portfolio's
        all-time high clears another <strong>step %</strong> above initial,
        permanently boost spending by <strong>boost %</strong> — even if the
        portfolio later falls back. At +20%: {exampleSteps} step{exampleSteps !== 1 ? 's' : ''},{' '}
        withdrawal = {exampleWd}% of initial.
      </div>
      <div className="floor-upside-grid">
        <label>
          Base rate (% of initial)
          <NumericInput
            value={baseRate}
            format={pctFmt}
            parse={pctParse}
            min={0}
            max={0.2}
            onChange={(v) => onChange(v, stepSize, stepBoost)}
          />
        </label>
        <label>
          Step size (% gain per ratchet click)
          <NumericInput
            value={stepSize}
            format={(v) => (v * 100).toFixed(0)}
            parse={(s) => {
              if (s.trim() === '') return null;
              const n = parseFloat(s);
              return isNaN(n) ? null : Math.max(0.01, n / 100);
            }}
            min={0.01}
            max={0.5}
            onChange={(v) => onChange(baseRate, v, stepBoost)}
          />
        </label>
        <label>
          Boost per step (% spending increase)
          <NumericInput
            value={stepBoost}
            format={(v) => (v * 100).toFixed(1).replace(/\.?0+$/, '')}
            parse={(s) => {
              if (s.trim() === '') return null;
              const n = parseFloat(s);
              return isNaN(n) ? null : Math.max(0, n / 100);
            }}
            min={0}
            max={0.5}
            onChange={(v) => onChange(baseRate, stepSize, v)}
          />
        </label>
      </div>
    </div>
  );
}

function FloorUpsideEditor({
  floor,
  marginalSpend,
  onChange,
}: {
  floor: number;
  marginalSpend: number;
  onChange: (floor: number, marginalSpend: number) => void;
}) {
  return (
    <div className="floor-upside-editor">
      <div className="floor-upside-hint">
        Withdraw at least <strong>floor %</strong> of initial each year. For
        every $1M the portfolio is above its starting value, spend an extra{' '}
        <strong>marginal $</strong>.
      </div>
      <div className="floor-upside-grid">
        <label>
          Floor (% of initial)
          <NumericInput
            value={floor}
            format={(v) => (v * 100).toFixed(2).replace(/\.?0+$/, '')}
            parse={(s) => {
              if (s.trim() === '') return null;
              const n = parseFloat(s);
              return isNaN(n) ? null : Math.max(0, n / 100);
            }}
            min={0}
            max={0.2}
            onChange={(v) => onChange(v, marginalSpend)}
          />
        </label>
        <label>
          Marginal spend ($k per $1M above initial)
          <NumericInput
            value={marginalSpend}
            format={(v) => (v * 1000).toFixed(2).replace(/\.?0+$/, '')}
            parse={(s) => {
              if (s.trim() === '') return null;
              const n = parseFloat(s);
              return isNaN(n) ? null : Math.max(0, n / 1000);
            }}
            min={0}
            max={0.5}
            onChange={(v) => onChange(floor, v)}
          />
        </label>
      </div>
    </div>
  );
}
