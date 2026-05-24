import { useScenarioStore } from '../../store/scenarioStore';
import { StepSlider } from '../ui/StepSlider';
import { NumericInput } from './NumericInput';

export function PortfolioInput() {
  const { initialBalance, horizonYears, setBalance, setHorizon } =
    useScenarioStore();

  const balanceFmt = `$${Math.round(initialBalance).toLocaleString('en-US')}`;
  const horizonFmt = `${horizonYears} yr${horizonYears === 1 ? '' : 's'}`;

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
          >
            <span className="portfolio-pill-label">Length</span>
            <span className="portfolio-pill-value">{horizonFmt}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
