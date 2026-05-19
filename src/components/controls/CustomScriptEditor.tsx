import { useEffect, useRef, useState } from 'react';

type Kind = 'withdrawal' | 'allocation';

type Props = {
  label: string;
  signature: string;
  initial: string;
  kind: Kind;
  onChange: (src: string) => void;
};

const DOCS: Record<Kind, { title: string; sections: Array<{ heading: string; content: string }> }> = {
  withdrawal: {
    title: 'Custom withdrawal rule — how it works',
    sections: [
      {
        heading: 'The idea',
        content:
          'This runs once per year of retirement. Whatever dollar amount\n' +
          'you return is what gets withdrawn that year. All amounts are\n' +
          'in today\'s purchasing power — no need to think about inflation.',
      },
      {
        heading: 'What you know each year',
        content:
          'state.t             — years into retirement so far (0 = year one)\n' +
          'state.balance       — how much is in the portfolio right now\n' +
          'state.calendarYear  — the actual calendar year (e.g. 1966)\n' +
          'state.cape          — how expensive the stock market is; higher\n' +
          '                      means pricier (not available before 1881)\n' +
          'initial             — what the portfolio started at on day one',
      },
      {
        heading: 'Looking back at past years',
        content:
          'state.trajectory holds every year that has already passed.\n' +
          'The last entry is last year. Each entry has:\n\n' +
          '.balance      — portfolio value at the end of that year\n' +
          '.withdrawal   — how much was taken out\n' +
          '.weights      — how money was split (stocks / bonds / cash)\n' +
          '.return       — how the portfolio did (0.07 means +7%)\n' +
          '.depleted     — true if the portfolio ran out that year',
      },
      {
        heading: 'Examples',
        content:
          '// Take 4% of the starting balance every year (classic rule)\nreturn 0.04 * initial;\n\n' +
          '// Take 3.5% of whatever it\'s worth today — automatically\n// pulls back after bad years, spends more after good ones\nreturn 0.035 * state.balance;\n\n' +
          '// Spend a little more in years after a strong market\nconst lastYear = state.trajectory[state.trajectory.length - 1];\nif (lastYear && lastYear.return > 0.10) return 0.05 * initial;\nreturn 0.04 * initial;\n\n' +
          '// Spend less when the market looks expensive\nconst cape = state.cape ?? 20;\nreturn (0.0175 + 0.5 / cape) * state.balance;',
      },
    ],
  },
  allocation: {
    title: 'Custom allocation rule — how it works',
    sections: [
      {
        heading: 'The idea',
        content:
          'This runs once per year and decides how to split the portfolio.\n' +
          'Return three numbers — the fractions going to stocks, bonds,\n' +
          'and cash. They must add up to exactly 1.0.',
      },
      {
        heading: 'What you know each year',
        content:
          'state.t             — years into retirement so far (0 = year one)\n' +
          'state.balance       — how much is in the portfolio right now\n' +
          'state.calendarYear  — the actual calendar year (e.g. 1966)\n' +
          'state.cape          — how expensive the stock market is; higher\n' +
          '                      means pricier (not available before 1881)',
      },
      {
        heading: 'Looking back at past years',
        content:
          'state.trajectory holds every year that has already passed.\n' +
          'The last entry is last year. Each entry has:\n\n' +
          '.balance      — portfolio value at the end of that year\n' +
          '.withdrawal   — how much was taken out\n' +
          '.weights      — how money was split (stocks / bonds / cash)\n' +
          '.return       — how the portfolio did (0.07 means +7%)\n' +
          '.depleted     — true if the portfolio ran out that year',
      },
      {
        heading: 'Examples',
        content:
          '// Always 60% stocks, 40% bonds\nreturn { stock: 0.6, bond: 0.4, cash: 0 };\n\n' +
          '// Gradually shift toward bonds as retirement goes on\n// (starts at 30% bonds, adds 1% each year, caps at 80%)\nconst bonds = Math.min(0.8, 0.3 + state.t * 0.01);\nreturn { stock: 1 - bonds, bond: bonds, cash: 0 };\n\n' +
          '// Go more conservative when the market looks expensive\nif (state.cape && state.cape > 30)\n  return { stock: 0.4, bond: 0.5, cash: 0.1 };\nreturn { stock: 0.7, bond: 0.3, cash: 0 };',
      },
    ],
  },
};

/**
 * Tiny editor for inline JS strategy bodies. The compiled function runs in
 * the worker (and on main when previewing) with full page privileges — there's
 * no sandbox. Acceptable for a personal tool; flagged in FOLLOWUPS.
 */
export function CustomScriptEditor({
  label,
  signature,
  initial,
  kind,
  onChange,
}: Props) {
  const [src, setSrc] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const docsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSrc(initial); }, [initial]);

  useEffect(() => {
    if (!showDocs) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowDocs(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showDocs]);

  const apply = () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function(signature.includes(',') ? 'state' : 'state', 'initial', src);
      setError(null);
      onChange(src);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const docs = DOCS[kind];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <div className="text-sm text-text-secondary">{label}</div>
        <button
          className="flex-shrink-0 w-[17px] h-[17px] rounded-full border border-text-disabled bg-surface-muted text-text-secondary text-xs font-bold leading-none cursor-pointer p-0 flex items-center justify-center hover:bg-surface-panel hover:border-primary hover:text-primary"
          onClick={() => setShowDocs((v) => !v)}
          title="Show API reference"
          aria-expanded={showDocs}
        >
          ?
        </button>
      </div>

      {showDocs && (
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setShowDocs(false)} />
          <div className="absolute z-[100] left-0 right-0 bg-surface border border-text-disabled rounded-md shadow-popover p-0 overflow-hidden" ref={docsRef}>
            <div className="flex items-center justify-between px-[10px] py-2 bg-surface-panel border-b border-border text-sm font-semibold text-text">
              <span>{docs.title}</span>
              <button className="border-none bg-transparent text-[16px] leading-none cursor-pointer text-text-faint px-[2px] hover:text-error" onClick={() => setShowDocs(false)}>×</button>
            </div>
            {docs.sections.map((s) => (
              <div key={s.heading} className="px-[10px] py-[7px] border-b border-border-light last:border-b-0">
                <div className="text-2xs font-bold uppercase tracking-[0.04em] text-text-faint mb-[3px]">{s.heading}</div>
                <pre className="m-0 font-mono text-[10.5px] text-text whitespace-pre-wrap leading-[1.5]">{s.content}</pre>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="font-mono text-xs text-text-muted">function ({signature}) {'{'}</div>
      <textarea
        className="w-full font-mono text-xs px-2 py-1.5 border border-text-disabled rounded resize-y"
        value={src}
        onChange={(e) => setSrc(e.target.value)}
        rows={6}
        spellCheck={false}
      />
      <div className="font-mono text-xs text-text-muted">{'}'}</div>
      {error && <div className="text-error text-xs whitespace-pre-wrap">{error}</div>}
      <button onClick={apply} className="text-sm px-2 py-1 border border-text-disabled bg-surface rounded-[3px] cursor-pointer self-start">
        apply
      </button>
      <div className="text-2xs text-text-faint">
        ⚠ Runs untrusted JS in your browser. Only paste scripts you wrote.
      </div>
    </div>
  );
}
