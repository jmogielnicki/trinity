import { useEffect, useState } from 'react';

type Props = {
  label: string;
  signature: string;
  initial: string;
  onChange: (src: string) => void;
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
  onChange,
}: Props) {
  const [src, setSrc] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when an external source (e.g. a preset) replaces the script.
  useEffect(() => { setSrc(initial); }, [initial]);

  const apply = () => {
    try {
      // Validate by compiling. Args don't matter here; we just want syntax check.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function(signature.includes(',') ? 'state' : 'state', 'initial', src);
      setError(null);
      onChange(src);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="control-group">
      <div className="control-label">{label}</div>
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
