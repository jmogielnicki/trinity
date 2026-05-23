import { useScenarioStore } from '../../store/scenarioStore';
import { NumericInput } from './NumericInput';

export function PortfolioInput() {
  const { initialBalance, horizonYears, setBalance, setHorizon } =
    useScenarioStore();

  const balanceFmt = `$${Math.round(initialBalance).toLocaleString('en-US')}`;
  const horizonFmt = `${horizonYears} yr${horizonYears === 1 ? '' : 's'}`;

  return (
    <div className="flex items-center gap-3">
      {/* ── Balance field ── */}
      <div
        className="relative overflow-hidden"
        style={{
          height: 'calc(56px - 28px * var(--scroll-p))',
          minWidth: '175px',
          transition: 'height 0.05s linear',
        }}
      >
        {/* Expanded label + input */}
        <label
          className="portfolio-field-expanded flex flex-col gap-1 text-sm text-text-secondary font-medium"
          style={{
            opacity: 'calc(1 - var(--scroll-p) * 2.2)',
            transform: 'translateY(calc(var(--scroll-p) * -4px))',
            transition: 'opacity 0.05s linear, transform 0.05s linear',
          }}
        >
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
        {/* Pill overlay */}
        <div
          className="portfolio-pill absolute inset-0 flex items-center"
          style={{
            opacity: 'calc((var(--scroll-p) - 0.35) * 3)',
            transform: 'translateY(calc((1 - var(--scroll-p)) * 6px))',
            transition: 'opacity 0.05s linear, transform 0.05s linear',
          }}
        >
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

      {/* Pill separator — fades in as pills appear */}
      <div
        className="w-px h-4 bg-border flex-shrink-0"
        style={{
          opacity: 'calc(var(--scroll-p) * 2)',
          transition: 'opacity 0.05s linear',
        }}
      />

      {/* ── Horizon field ── */}
      <div
        className="relative overflow-hidden"
        style={{
          height: 'calc(56px - 28px * var(--scroll-p))',
          minWidth: '120px',
          transition: 'height 0.05s linear',
        }}
      >
        {/* Expanded label + input */}
        <label
          className="portfolio-field-expanded flex flex-col gap-1 text-sm text-text-secondary font-medium"
          style={{
            opacity: 'calc(1 - var(--scroll-p) * 2.2)',
            transform: 'translateY(calc(var(--scroll-p) * -4px))',
            transition: 'opacity 0.05s linear, transform 0.05s linear',
          }}
        >
          Horizon (years)
          <NumericInput
            value={horizonYears}
            onChange={(v) => setHorizon(Math.round(v))}
            min={1}
            max={80}
            parse={(s) => {
              if (s.trim() === '') return null;
              const n = parseInt(s, 10);
              return isNaN(n) ? null : n;
            }}
          />
        </label>
        {/* Pill overlay */}
        <div
          className="portfolio-pill absolute inset-0 flex items-center"
          style={{
            opacity: 'calc((var(--scroll-p) - 0.35) * 3)',
            transform: 'translateY(calc((1 - var(--scroll-p)) * 6px))',
            transition: 'opacity 0.05s linear, transform 0.05s linear',
          }}
        >
          <button
            className="portfolio-pill-inner"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            tabIndex={-1}
          >
            <span className="portfolio-pill-label">Horizon</span>
            <span className="portfolio-pill-value">{horizonFmt}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
