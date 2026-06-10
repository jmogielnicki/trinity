import { useEffect, useRef, useState } from 'react';
import type { IncomeStream, OneTimeCashflow } from '../../engine/cashflows';
import { useScenarioStore } from '../../store/scenarioStore';
import { IconButton } from '../ui/IconButton';
import { Button } from '../ui/Button';
import { FIELD_BASE, FIELD_FULL, FIELD_SM } from '../ui/fieldCls';
import { NumericInput } from './NumericInput';
import { fmtThousands, parseThousands } from './situationSummary';

const FIELD_AMOUNT = `w-24 px-2 py-[7px] text-text ${FIELD_BASE}`;

/** Numeric input that allows blank — blank maps to null (e.g. "no end year"). */
function OptionalNumber({
  value,
  onChange,
  min,
  max,
  placeholder,
  className = FIELD_SM,
  title,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
  title?: string;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value == null ? '' : String(value));
  }, [value]);

  const clamp = (n: number) => {
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    return Math.round(n);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      placeholder={placeholder}
      title={title}
      className={className}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw.trim() === '') {
          onChange(null);
          return;
        }
        const n = parseFloat(raw);
        if (!isNaN(n)) onChange(clamp(n));
      }}
      onBlur={() => {
        focused.current = false;
        if (text.trim() === '') {
          onChange(null);
          return;
        }
        const n = parseFloat(text);
        if (isNaN(n)) {
          setText(value == null ? '' : String(value));
        } else {
          const c = clamp(n);
          onChange(c);
          setText(String(c));
        }
      }}
    />
  );
}

/**
 * External income & one-time events: Social Security, pensions, downsizing,
 * a roof. Everything in today's dollars. When a retirement age is set, the
 * timing fields are entered as ages instead of years-into-retirement.
 */
export function IncomeInput() {
  const {
    incomes,
    cashflows,
    retireAge,
    horizonYears,
    setIncomes,
    setCashflows,
    setRetireAge,
  } = useScenarioStore();

  // Presentation offset: with a retirement age set, timing fields read/write
  // ages; the stored values stay years-into-retirement either way.
  const offset = retireAge ?? 0;
  const unit = retireAge != null ? 'age' : 'yr';

  const updIncome = (i: number, patch: Partial<IncomeStream>) =>
    setIncomes(incomes.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const updFlow = (i: number, patch: Partial<OneTimeCashflow>) =>
    setCashflows(cashflows.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const addIncome = () =>
    setIncomes([
      ...incomes,
      {
        label: incomes.length === 0 ? 'Social Security' : 'Pension',
        annual: 24_000,
        // SS default: claim at 67 when ages are in play, otherwise year 0.
        startsAtYear:
          retireAge != null
            ? Math.min(horizonYears - 1, Math.max(0, 67 - retireAge))
            : 0,
      },
    ]);

  const addFlow = () =>
    setCashflows([
      ...cashflows,
      { label: '', amount: -50_000, atYear: Math.min(10, horizonYears - 1) },
    ]);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center justify-between gap-2 text-sm text-text-secondary">
        <span>
          Retirement age{' '}
          <span className="text-text-faint">(optional)</span>
        </span>
        <OptionalNumber
          value={retireAge}
          onChange={setRetireAge}
          min={20}
          max={90}
          placeholder="—"
          title="When set, income timing below is entered as ages"
        />
      </label>

      {incomes.map((s, i) => (
        <div
          key={i}
          className="flex flex-col gap-1.5 rounded-md border border-border p-2"
        >
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              className={FIELD_FULL}
              value={s.label ?? ''}
              placeholder="Social Security"
              onChange={(e) => updIncome(i, { label: e.target.value })}
            />
            <IconButton
              onClick={() => setIncomes(incomes.filter((_, j) => j !== i))}
              aria-label="Remove income"
            >
              ✕
            </IconButton>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-text-secondary">
            $
            <NumericInput
              value={s.annual}
              onChange={(v) => updIncome(i, { annual: v })}
              min={0}
              format={fmtThousands}
              parse={parseThousands}
              className={FIELD_AMOUNT}
            />
            /yr from {unit}
            <NumericInput
              value={s.startsAtYear + offset}
              onChange={(v) => {
                const startsAtYear = Math.max(0, Math.round(v - offset));
                // Keep the (inclusive) end from sliding before the start —
                // a start > end stream would silently pay nothing.
                updIncome(i, {
                  startsAtYear,
                  ...(s.endsAtYear != null &&
                    s.endsAtYear < startsAtYear && { endsAtYear: startsAtYear }),
                });
              }}
              min={offset}
              className={FIELD_SM}
            />
            to
            <OptionalNumber
              value={s.endsAtYear == null ? null : s.endsAtYear + offset}
              onChange={(v) =>
                updIncome(i, {
                  endsAtYear: v == null ? undefined : Math.max(0, v - offset),
                })
              }
              min={s.startsAtYear + offset}
              placeholder="life"
              title="Last year paid (inclusive). Blank = lifelong."
            />
          </div>
        </div>
      ))}

      {cashflows.map((f, i) => (
        <div
          key={i}
          className="flex flex-col gap-1.5 rounded-md border border-border p-2"
        >
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              className={FIELD_FULL}
              value={f.label ?? ''}
              placeholder="New roof, downsizing…"
              onChange={(e) => updFlow(i, { label: e.target.value })}
            />
            <IconButton
              onClick={() => setCashflows(cashflows.filter((_, j) => j !== i))}
              aria-label="Remove event"
            >
              ✕
            </IconButton>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-text-secondary">
            $
            <NumericInput
              value={f.amount}
              onChange={(v) => updFlow(i, { amount: v })}
              format={fmtThousands}
              parse={parseThousands}
              className={FIELD_AMOUNT}
              title="Negative = expense, positive = money in"
            />
            at {unit}
            <NumericInput
              value={f.atYear + offset}
              onChange={(v) =>
                updFlow(i, { atYear: Math.max(0, Math.round(v - offset)) })
              }
              min={offset}
              className={FIELD_SM}
            />
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" onClick={addIncome}>
          + income
        </Button>
        <Button variant="outline" size="sm" onClick={addFlow}>
          + one-time event
        </Button>
      </div>

      {(incomes.length > 0 || cashflows.length > 0) && (
        <p className="text-xs text-text-faint m-0 leading-relaxed">
          Today&apos;s dollars. Income reduces what&apos;s drawn from the
          portfolio each year; one-time amounts are negative for expenses and
          positive for money coming in. Surpluses are invested.
        </p>
      )}
    </div>
  );
}
