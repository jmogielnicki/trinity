import type { WithdrawalStrategy } from '../../engine/strategies';
import { CustomScriptEditor } from './CustomScriptEditor';
import { NumericInput } from './NumericInput';
import { RuleBuilder } from './RuleBuilder';
import { WithdrawalCurve } from './WithdrawalCurve';
import { StepSlider } from '../ui/StepSlider';
import { TabBar } from '../ui/TabBar';
import { ToggleButton } from '../ui/ToggleButton';
import { useUIStore } from '../../store/uiStore';

type Mode = 'fixed' | 'curve' | 'floor-upside' | 'ratchet' | 'cape' | 'rules' | 'script';

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
  if (w.type === 'fixedPercent') return 'fixed';
  // Legacy structured types that have been superseded by customSrc scripts —
  // route to script tab so old saved scenarios still display something useful.
  if (w.type === 'guardrails' || w.type === 'endowment' || w.type === 'vanguardDynamic')
    return 'script';
  // 'curve' covers piecewiseLinear (what WithdrawalCurve emits) and the
  // legacy 'piecewise' type so old saved scenarios still resolve.
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
    if (m === 'fixed') {
      const rate =
        withdrawal.type === 'fixedPercent'
          ? withdrawal.rate
          : withdrawal.type === 'piecewiseLinear'
            ? (withdrawal.points[0]?.rate ?? 0.04)
            : withdrawal.type === 'piecewise'
              ? (withdrawal.pieces[0]?.rate ?? 0.04)
              : 0.04;
      onChange({ type: 'fixedPercent', rate });
    }
    if (m === 'curve') {
      const rate = withdrawal.type === 'fixedPercent' ? withdrawal.rate : 0.04;
      const lastT = Math.max(0, horizonYears - 1);
      onChange({
        type: 'piecewiseLinear',
        points: Array.from({ length: 5 }, (_, i) => ({
          t: (i / 4) * lastT,
          rate,
        })),
      });
    }
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
        floor: 0.0325,
        upsideRate: 0.03,
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
    <div className="flex flex-col gap-1.5">
      <ModeToggle current={mode} onChange={switchMode} />
      {mode === 'fixed' && withdrawal.type === 'fixedPercent' && (
        <FixedWithdrawalSlider
          rate={withdrawal.rate}
          onChange={(rate) => onChange({ type: 'fixedPercent', rate })}
        />
      )}
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
          upsideRate={withdrawal.upsideRate}
          onChange={(floor, upsideRate) =>
            onChange({ type: 'floorAndUpside', floor, upsideRate })
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
          kind="withdrawal"
          initial={
            withdrawal.type === 'customSrc' ? withdrawal.src : DEFAULT_SCRIPT
          }
          onChange={(src) => onChange({ type: 'customSrc', src })}
        />
      )}
    </div>
  );
}

// Modes flagged `simple` are always offered; the rest are revealed only in
// Advanced mode (or when already active, so loading an advanced preset in
// Simple mode still shows its selected tab).
const WITHDRAWAL_MODES: Array<{ k: Mode; label: string; simple?: boolean }> = [
  { k: 'fixed', label: 'Fixed', simple: true },
  { k: 'curve', label: 'Curve', simple: true },
  { k: 'ratchet', label: 'Ratchet' },
  { k: 'floor-upside', label: 'Floor + upside' },
  { k: 'cape', label: 'CAPE' },
  { k: 'rules', label: 'Rules' },
  { k: 'script', label: 'Script' },
];

function ModeToggle({
  current,
  onChange,
}: {
  current: Mode;
  onChange: (m: Mode) => void;
}) {
  const editorMode = useUIStore((s) => s.editorMode);
  const modes = WITHDRAWAL_MODES.filter(
    (m) => editorMode === 'advanced' || m.simple || m.k === current,
  );
  return (
    <TabBar>
      {modes.map((m) => (
        <ToggleButton key={m.k} active={current === m.k} onClick={() => onChange(m.k)}>
          {m.label}
        </ToggleButton>
      ))}
    </TabBar>
  );
}

const FIXED_MIN = 0.02;
const FIXED_MAX = 0.10;
const FIXED_STEP = 0.0025;

function FixedWithdrawalSlider({
  rate,
  onChange,
}: {
  rate: number;
  onChange: (rate: number) => void;
}) {
  return (
    <div className="control-group">
      <StepSlider
        value={rate}
        onChange={onChange}
        min={FIXED_MIN}
        max={FIXED_MAX}
        step={FIXED_STEP}
        format={(v) => `${(v * 100).toFixed(2)}%`}
        minLabel="2%"
        maxLabel="10%"
        labelPosition="above-thumb"
      />
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
    <div className="flex flex-col gap-2.5">
      <div className="text-xs text-text-muted leading-[1.4]">
        Each year: withdraw <strong>rate × current balance</strong>, where{' '}
        <strong>rate = a + b ÷ CAPE</strong>. At CAPE {exampleCape.toFixed(1)},{' '}
        rate = {exampleRate.toFixed(2)}%. Adjusts automatically as markets move.
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-secondary font-medium">
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
        <label className="flex flex-col gap-1 text-xs text-text-secondary font-medium">
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
        <label className="flex flex-col gap-1 text-xs text-text-secondary font-medium">
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
  const exampleWd = (baseRate * (1 + stepBoost * exampleSteps) * 100).toFixed(2);
  const pctFmt = (v: number) => (v * 100).toFixed(2).replace(/\.?0+$/, '');
  const pctParse = (s: string) => {
    if (s.trim() === '') return null;
    const n = parseFloat(s);
    return isNaN(n) ? null : Math.max(0, n / 100);
  };
  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-xs text-text-muted leading-[1.4]">
        Start at <strong>base rate</strong>. Each time the portfolio's
        all-time high clears another <strong>step %</strong> above initial,
        permanently boost spending by <strong>boost %</strong> — even if the
        portfolio later falls back. At +20%: {exampleSteps} step{exampleSteps !== 1 ? 's' : ''},{' '}
        withdrawal = {exampleWd}% of initial.
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-secondary font-medium">
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
        <label className="flex flex-col gap-1 text-xs text-text-secondary font-medium">
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
        <label className="flex flex-col gap-1 text-xs text-text-secondary font-medium">
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
  upsideRate,
  onChange,
}: {
  floor: number;
  upsideRate: number;
  onChange: (floor: number, upsideRate: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-xs text-text-muted leading-[1.4]">
        Each year withdraw the <strong>greater of</strong>: a{' '}
        <strong>floor %</strong> of your initial balance, or an{' '}
        <strong>upside %</strong> of your current balance. The floor protects
        spending in down markets; the upside lets you spend more when the
        portfolio grows.
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col justify-end gap-1 text-xs text-text-secondary font-medium">
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
            onChange={(v) => onChange(v, upsideRate)}
          />
        </label>
        <label className="flex flex-col justify-end gap-1 text-xs text-text-secondary font-medium">
          Upside (% of current balance)
          <NumericInput
            value={upsideRate}
            format={(v) => (v * 100).toFixed(2).replace(/\.?0+$/, '')}
            parse={(s) => {
              if (s.trim() === '') return null;
              const n = parseFloat(s);
              return isNaN(n) ? null : Math.max(0, n / 100);
            }}
            min={0}
            max={0.2}
            onChange={(v) => onChange(floor, v)}
          />
        </label>
      </div>
    </div>
  );
}
