import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useScenarioStore } from '../../store/scenarioStore';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { SituationEditor } from './SituationEditor';
import { flowsPillValue, fmtCompact } from './situationSummary';

const POPOVER_W = 400;

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
 *
 * Both editors render through portals: the title box clips overflow and the
 * header animates with transforms, either of which would break an overlay
 * rendered in place. The popover pins under the live header height
 * (--header-h) and to the bar's x-position, so it stays attached while the
 * header shrinks on scroll.
 */
export function PortfolioInput() {
  const { initialBalance, horizonYears, incomes, cashflows, retireAge } =
    useScenarioStore();
  const [open, setOpen] = useState(false);
  const [popLeft, setPopLeft] = useState(8);
  const barRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Align the popover with the pill bar, clamped to the viewport.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = barRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = Math.min(POPOVER_W, window.innerWidth * 0.92);
      setPopLeft(Math.max(8, Math.min(r.left, window.innerWidth - w - 8)));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  // Close the desktop popover on outside click; close either on Escape.
  // The sheet only closes via its backdrop, Done, or Escape — taps inside
  // it (including focusing inputs) must not count as "outside".
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        !popoverRef.current?.contains(t) &&
        !sheetRef.current?.contains(t) &&
        !barRef.current?.contains(t)
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
  // sticky header). Tracks breakpoint changes so a rotation with the editor
  // open doesn't strand the lock.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia('(min-width: 850px)');
    const apply = () => {
      document.body.style.overflow = mq.matches ? '' : 'hidden';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => {
      mq.removeEventListener('change', apply);
      document.body.style.overflow = '';
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
    <div ref={barRef} className="flex items-center gap-2 sm:gap-2.5">
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

      {/* Desktop: popover pinned under the header — no backdrop, so the
          charts behind stay visible and re-run live as the inputs change. */}
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="hidden md:block fixed z-50 w-[400px] max-w-[92vw] max-h-[calc(100vh-var(--header-h,64px)-24px)] overflow-y-auto overscroll-contain bg-surface border border-border rounded-lg shadow-popover p-4"
            style={{ top: 'calc(var(--header-h, 64px) + 8px)', left: popLeft }}
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
          </div>,
          document.body,
        )}

      {/* Mobile: bottom sheet. */}
      {open &&
        createPortal(
          <div className="md:hidden fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setOpen(false)}
            />
            <div
              ref={sheetRef}
              className="absolute inset-x-0 bottom-0 bg-surface rounded-t-2xl shadow-popover max-h-[85vh] overflow-y-auto overscroll-contain p-5 pb-7"
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
