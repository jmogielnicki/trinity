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
    title: 'Withdrawal script reference',
    sections: [
      {
        heading: 'Signature',
        content: 'function(state, initial) { ... }\nReturn a real-dollar amount to withdraw this year.',
      },
      {
        heading: 'state fields',
        content:
          'state.t             — year index (0 = first year of retirement)\n' +
          'state.balance       — portfolio balance in real $ before withdrawal\n' +
          'state.calendarYear  — actual calendar year (e.g. 1966)\n' +
          'state.cape          — Shiller CAPE (P/E10); null before ~1881\n' +
          'state.trajectory    — array of past YearRecord (see below)',
      },
      {
        heading: 'initial',
        content: 'Starting portfolio balance in real $.',
      },
      {
        heading: 'state.trajectory entries',
        content:
          '.t            — year index\n' +
          '.calendarYear — calendar year\n' +
          '.balance      — end-of-year portfolio balance\n' +
          '.withdrawal   — real $ withdrawn that year\n' +
          '.weights      — { stock, bond, cash } allocation\n' +
          '.return       — portfolio return (e.g. 0.07 = 7%)\n' +
          '.depleted     — true if portfolio ran out',
      },
      {
        heading: 'Examples',
        content:
          '// Classic 4% rule\nreturn 0.04 * initial;\n\n' +
          '// 3.5% of current balance (self-adjusting)\nreturn 0.035 * state.balance;\n\n' +
          '// Spend more after a strong year\nconst last = state.trajectory[state.trajectory.length - 1];\nif (last && last.return > 0.10) return 0.05 * initial;\nreturn 0.04 * initial;\n\n' +
          '// CAPE-based: withdraw less when market is expensive\nconst cape = state.cape ?? 20;\nreturn (0.0175 + 0.5 / cape) * state.balance;',
      },
    ],
  },
  allocation: {
    title: 'Allocation script reference',
    sections: [
      {
        heading: 'Signature',
        content:
          'function(state) { ... }\nReturn { stock, bond, cash } weights that sum to 1.',
      },
      {
        heading: 'state fields',
        content:
          'state.t             — year index (0 = first year of retirement)\n' +
          'state.balance       — current portfolio balance in real $\n' +
          'state.calendarYear  — actual calendar year (e.g. 1966)\n' +
          'state.cape          — Shiller CAPE (P/E10); null before ~1881\n' +
          'state.trajectory    — array of past YearRecord (see below)',
      },
      {
        heading: 'state.trajectory entries',
        content:
          '.t            — year index\n' +
          '.calendarYear — calendar year\n' +
          '.balance      — end-of-year portfolio balance\n' +
          '.withdrawal   — real $ withdrawn that year\n' +
          '.weights      — { stock, bond, cash } allocation\n' +
          '.return       — portfolio return (e.g. 0.07 = 7%)\n' +
          '.depleted     — true if portfolio ran out',
      },
      {
        heading: 'Examples',
        content:
          '// Static 60/40\nreturn { stock: 0.6, bond: 0.4, cash: 0 };\n\n' +
          '// Age in bonds: bonds increase 1% per year\nconst b = Math.min(0.8, 0.3 + state.t * 0.01);\nreturn { stock: 1 - b, bond: b, cash: 0 };\n\n' +
          '// Go defensive when CAPE is high\nif (state.cape && state.cape > 30)\n  return { stock: 0.4, bond: 0.5, cash: 0.1 };\nreturn { stock: 0.7, bond: 0.3, cash: 0 };',
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
    <div className="control-group">
      <div className="script-label-row">
        <div className="control-label">{label}</div>
        <button
          className="script-help-btn"
          onClick={() => setShowDocs((v) => !v)}
          title="Show API reference"
          aria-expanded={showDocs}
        >
          ?
        </button>
      </div>

      {showDocs && (
        <>
          <div className="script-docs-backdrop" onClick={() => setShowDocs(false)} />
          <div className="script-docs" ref={docsRef}>
            <div className="script-docs-header">
              <span>{docs.title}</span>
              <button className="script-docs-close" onClick={() => setShowDocs(false)}>×</button>
            </div>
            {docs.sections.map((s) => (
              <div key={s.heading} className="script-docs-section">
                <div className="script-docs-heading">{s.heading}</div>
                <pre className="script-docs-pre">{s.content}</pre>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="script-sig">function ({signature}) {'{'}</div>
      <textarea
        className="script-area"
        value={src}
        onChange={(e) => setSrc(e.target.value)}
        rows={6}
        spellCheck={false}
      />
      <div className="script-sig">{'}'}</div>
      {error && <div className="script-error">{error}</div>}
      <button onClick={apply} className="apply-btn">
        apply
      </button>
      <div className="script-warn">
        ⚠ Runs untrusted JS in your browser. Only paste scripts you wrote.
      </div>
    </div>
  );
}
