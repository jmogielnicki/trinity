import React, { useRef } from 'react';
import type { WithdrawalStrategy } from '../../engine/strategies';
import { CustomScriptEditor } from './CustomScriptEditor';
import { NumericInput } from './NumericInput';
import { RuleBuilder } from './RuleBuilder';
import { WithdrawalCurve } from './WithdrawalCurve';

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

function ModeToggle({
  current,
  onChange,
}: {
  current: Mode;
  onChange: (m: Mode) => void;
}) {
  const modes: Array<{ k: Mode; label: string }> = [
    { k: 'fixed', label: 'fixed' },
    { k: 'curve', label: 'curve' },
    { k: 'floor-upside', label: 'floor + upside' },
    { k: 'ratchet', label: 'ratchet' },
    { k: 'cape', label: 'CAPE' },
    { k: 'rules', label: 'rules' },
    { k: 'script', label: 'script' },
  ];
  return (
    <div className="flex gap-0.5 bg-surface-muted rounded-lg p-[3px] overflow-x-auto scrollbar-none">
      {modes.map((m) => (
        <button
          key={m.k}
          className={`text-xs px-[10px] py-1 border-none rounded-md cursor-pointer text-text-muted font-medium font-[inherit] transition-[background,color,box-shadow] duration-[120ms] whitespace-nowrap flex-shrink-0${current === m.k ? ' bg-surface text-text shadow-card' : ' bg-transparent hover:bg-white/60 hover:text-text-body'}`}
          onClick={() => onChange(m.k)}
        >
          {m.label}
        </button>
      ))}
    </div>
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
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const W = 232;
  const H = 56;
  const PAD = 20;
  const trackY = 32;
  const trackLeft = PAD;
  const trackRight = W - PAD;

  const rateToX = (r: number) =>
    trackLeft + ((r - FIXED_MIN) / (FIXED_MAX - FIXED_MIN)) * (trackRight - trackLeft);

  const xToRate = (clientX: number) => {
    if (!svgRef.current) return rate;
    const rect = svgRef.current.getBoundingClientRect();
    const x = (clientX - rect.left) * (W / rect.width);
    const raw =
      FIXED_MIN + ((x - trackLeft) / (trackRight - trackLeft)) * (FIXED_MAX - FIXED_MIN);
    const clamped = Math.max(FIXED_MIN, Math.min(FIXED_MAX, raw));
    return Math.round(clamped / FIXED_STEP) * FIXED_STEP;
  };

  const cx = rateToX(rate);

  return (
    <div className="control-group">
      <svg
        ref={svgRef}
        width={W}
        height={H}
        style={{ display: 'block', overflow: 'visible', touchAction: 'none' }}
      >
        {/* Track background */}
        <line
          x1={trackLeft} y1={trackY}
          x2={trackRight} y2={trackY}
          stroke="#e0e0e0" strokeWidth={5} strokeLinecap="round"
        />
        {/* Filled portion */}
        <line
          x1={trackLeft} y1={trackY}
          x2={cx} y2={trackY}
          stroke="#357" strokeWidth={5} strokeLinecap="round"
        />
        {/* End labels */}
        <text x={trackLeft} y={trackY + 14} textAnchor="middle" fontSize={9} fill="#aaa">2%</text>
        <text x={trackRight} y={trackY + 14} textAnchor="middle" fontSize={9} fill="#aaa">10%</text>
        {/* Handle */}
        <circle
          cx={cx} cy={trackY} r={11}
          fill="#fff" stroke="#357" strokeWidth={2}
          style={{ cursor: 'ew-resize' }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragging.current = true;
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return;
            onChange(xToRate(e.clientX));
          }}
          onPointerUp={() => { dragging.current = false; }}
        />
        {/* Rate label above handle */}
        <text
          x={cx} y={trackY - 14}
          textAnchor="middle"
          fontSize={13} fontWeight={600} fill="#1a1a1a"
          style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 } as React.CSSProperties}
          pointerEvents="none"
        >
          {(rate * 100).toFixed(2)}%
        </text>
      </svg>
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
    <div className="flex flex-col gap-[10px]">
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
    <div className="flex flex-col gap-[10px]">
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
  marginalSpend,
  onChange,
}: {
  floor: number;
  marginalSpend: number;
  onChange: (floor: number, marginalSpend: number) => void;
}) {
  return (
    <div className="flex flex-col gap-[10px]">
      <div className="text-xs text-text-muted leading-[1.4]">
        Withdraw at least <strong>floor %</strong> of initial each year. For
        every $1M the portfolio is above its starting value, spend an extra{' '}
        <strong>marginal $</strong>.
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-secondary font-medium">
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
        <label className="flex flex-col gap-1 text-xs text-text-secondary font-medium">
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
