import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { IncomeStream, OneTimeCashflow } from '../../engine/cashflows';
import { useScenarioStore } from '../../store/scenarioStore';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { StepSlider } from '../ui/StepSlider';
import { FIELD_FULL } from '../ui/fieldCls';
import { IncomeInput } from './IncomeInput';
import { NumericInput } from './NumericInput';

const fmtK = (v: number) =>
  v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`;

/** One-line summary of the external cash flows, e.g. "Social Security $24k/yr · 1 event". */
function flowsSummary(
  incomes: IncomeStream[],
  cashflows: OneTimeCashflow[],
): string {
  const parts: string[] = [];
  if (incomes.length === 1) {
    const s = incomes[0];
    parts.push(`${s.label?.trim() || 'Income'} ${fmtK(s.annual)}/yr`);
  } else if (incomes.length > 1) {
    parts.push(`${incomes.length} income streams`);
  }
  if (cashflows.length > 0) {
    parts.push(`${cashflows.length} event${cashflows.length === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

/** Short pill value, e.g. "$24k/yr" / "2 events" / "—". */
function flowsPillValue(
  incomes: IncomeStream[],
  cashflows: OneTimeCashflow[],
): string {
  if (incomes.length > 0) {
    const total = incomes.reduce((sum, s) => sum + s.annual, 0);
    return `${fmtK(total)}/yr`;
  }
  if (cashflows.length > 0) {
    return `${cashflows.length} event${cashflows.length === 1 ? '' : 's'}`;
  }
  return '—';
}

/**
 * Modal editor for income & one-time events. Rendered through a portal:
 * the header's scroll-collapse machinery uses transforms, which would
 * otherwise re-anchor a fixed-position overlay.
 */
function IncomeEventsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface rounded-lg shadow-popover w-full max-w-[440px] max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-text m-0">
            Income &amp; one-time events
          </h2>
          <IconButton onClick={onClose} aria-label="Close">
            ✕
          </IconButton>
        </div>
        <p className="text-sm text-text-muted mt-1 mb-4">
          Part of your circumstances, like balance and length — applies to
          every plan you build, compare, or optimize.
        </p>
        <IncomeInput />
        <div className="mt-5">
          <Button variant="soft" fullWidth onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function PortfolioInput() {
  const {
    initialBalance,
    horizonYears,
    incomes,
    cashflows,
    retireAge,
    setBalance,
    setHorizon,
  } = useScenarioStore();
  const [flowsOpen, setFlowsOpen] = useState(false);

  const balanceFmt = `$${Math.round(initialBalance).toLocaleString('en-US')}`;
  const horizonFmt =
    retireAge != null
      ? `${retireAge} → ${retireAge + horizonYears}`
      : `${horizonYears} yr${horizonYears === 1 ? '' : 's'}`;
  const flowsFull = flowsSummary(incomes, cashflows);

  return (
    <div className="flex items-center gap-3">
      {/* ── Balance field ── */}
      <div className="portfolio-field-wrap" style={{ minWidth: '175px' }}>
        <label className="portfolio-field-expanded flex flex-col gap-1 text-sm text-text-secondary font-medium">
          Initial balance ($, real)
          <NumericInput
            value={initialBalance}
            onChange={setBalance}
            min={0}
            format={(v) => Math.round(v).toLocaleString('en-US')}
            parse={(s) => {
              if (s.trim() === '') return null;
              const n = parseFloat(s.replace(/,/g, ''));
              return isNaN(n) ? null : n;
            }}
          />
        </label>
        <div className="portfolio-pill">
          <button
            className="portfolio-pill-inner"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            tabIndex={-1}
          >
            <span className="portfolio-pill-label">Balance</span>
            <span className="portfolio-pill-value">{balanceFmt}</span>
          </button>
        </div>
      </div>

      {/* Separator — fades in as pills appear */}
      <div className="pill-sep" />

      {/* ── Horizon field ── */}
      <div className="portfolio-field-wrap" style={{ minWidth: '180px' }}>
        <div className="portfolio-field-expanded flex flex-col gap-1 text-sm text-text-secondary font-medium">
          Retirement length (years)
          <StepSlider
            value={horizonYears}
            onChange={(v) => setHorizon(v)}
            min={20}
            max={60}
            step={5}
            format={(v) => String(v)}
            labelPosition="above-thumb"
          />
        </div>
        <div className="portfolio-pill">
          <button
            className="portfolio-pill-inner"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            tabIndex={-1}
            title={`${horizonYears} years`}
          >
            <span className="portfolio-pill-label">
              {retireAge != null ? 'Ages' : 'Length'}
            </span>
            <span className="portfolio-pill-value">{horizonFmt}</span>
          </button>
        </div>
      </div>

      <div className="pill-sep" />

      {/* ── Income & events field — summary chip opening the modal editor ── */}
      <div className="portfolio-field-wrap" style={{ minWidth: '170px' }}>
        <div className="portfolio-field-expanded flex flex-col gap-1 text-sm text-text-secondary font-medium">
          Income &amp; events
          <button
            className={`${FIELD_FULL} cursor-pointer text-left truncate ${
              flowsFull ? 'text-text' : 'text-text-faint'
            }`}
            onClick={() => setFlowsOpen(true)}
            title="Social Security, pensions, one-time expenses or windfalls"
          >
            {flowsFull || 'None — add…'}
          </button>
        </div>
        <div className="portfolio-pill">
          <button
            className="portfolio-pill-inner"
            onClick={() => setFlowsOpen(true)}
            tabIndex={-1}
          >
            <span className="portfolio-pill-label">Income</span>
            <span className="portfolio-pill-value">
              {flowsPillValue(incomes, cashflows)}
            </span>
          </button>
        </div>
      </div>

      {flowsOpen && <IncomeEventsModal onClose={() => setFlowsOpen(false)} />}
    </div>
  );
}
