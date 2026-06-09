import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useScenarioStore } from '../../store/scenarioStore';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { SituationEditor } from './SituationEditor';
import { flowsPillValue, fmtCompact } from './situationSummary';

function Pill({
  label,
  value,
  onClick,
}: {
  label: string;
  value: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="portfolio-pill-inner"
      onClick={onClick}
      aria-haspopup="dialog"
      title="Edit your situation"
    >
      <span className="portfolio-pill-label">{label}</span>
      <span className="portfolio-pill-value">{value}</span>
    </button>
  );
}

/**
 * The "your situation" bar: an always-visible row of pills (balance, length,
 * income) summarizing the circumstances every plan runs under. Tapping any
 * pill opens the editor — an anchored popover on desktop (charts stay visible
 * and live-update), a bottom sheet on mobile.
 */
export function PortfolioInput() {
  const { initialBalance, horizonYears, incomes, cashflows, retireAge } =
    useScenarioStore();
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close the desktop popover on outside click; close either on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        !popoverRef.current?.contains(e.target as Node) &&
        !barRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Lock body scroll while the mobile sheet is up (the popover doesn't need
  // it — scrolling with it open is harmless since it's anchored in the
  // sticky header).
  useEffect(() => {
    if (!open || window.matchMedia('(min-width: 850px)').matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Full balance where there's room; compact ("$1M") on narrow phones so all
  // three pills fit without scrolling.
  const balanceFmt = (
    <>
      <span className="hidden sm:inline">{`$${Math.round(initialBalance).toLocaleString('en-US')}`}</span>
      <span className="sm:hidden">{fmtCompact(initialBalance)}</span>
    </>
  );
  const horizonFmt =
    retireAge != null
      ? `${retireAge} → ${retireAge + horizonYears}`
      : `${horizonYears} yr${horizonYears === 1 ? '' : 's'}`;

  return (
    <div ref={barRef} className="relative flex items-center gap-2 sm:gap-2.5">
      <Pill label="Balance" value={balanceFmt} onClick={() => setOpen(true)} />
      <Pill
        label={retireAge != null ? 'Ages' : 'Length'}
        value={horizonFmt}
        onClick={() => setOpen(true)}
      />
      <Pill
        label="Income"
        value={flowsPillValue(incomes, cashflows)}
        onClick={() => setOpen(true)}
      />

      {/* Desktop: popover anchored under the bar — no backdrop, so the charts
          behind stay visible and re-run live as the inputs change. */}
      {open && (
        <div
          ref={popoverRef}
          className="hidden md:block absolute left-0 top-[calc(100%+10px)] z-50 w-[400px] max-w-[92vw] bg-surface border border-border rounded-lg shadow-popover p-4"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-display text-lg font-bold text-text m-0">
              Your situation
            </h2>
            <IconButton onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </IconButton>
          </div>
          <SituationEditor />
        </div>
      )}

      {/* Mobile: bottom sheet via portal (the header animates with
          transforms, which would re-anchor a fixed overlay rendered here). */}
      {open &&
        createPortal(
          <div className="md:hidden fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setOpen(false)}
            />
            <div className="absolute inset-x-0 bottom-0 bg-surface rounded-t-2xl shadow-popover max-h-[85vh] overflow-y-auto p-5 pb-7">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="font-display text-lg font-bold text-text m-0">
                  Your situation
                </h2>
                <IconButton onClick={() => setOpen(false)} aria-label="Close">
                  ✕
                </IconButton>
              </div>
              <SituationEditor />
              <div className="mt-5">
                <Button variant="soft" fullWidth onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
