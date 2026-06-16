import type { ReactNode } from 'react';

/**
 * Inline advisory note shown beneath a control. Always advisory — it never
 * blocks a run (UX principle: the default scenario stays warning-free, and a
 * warning is a nudge, not a gate).
 */
type Variant = 'warn' | 'info';

const VARIANT: Record<Variant, { border: string; icon: string }> = {
  warn: { border: 'var(--color-stale)', icon: '⚠' },
  info: { border: 'var(--color-border-strong)', icon: 'ⓘ' },
};

export function FieldNote({
  children,
  variant = 'warn',
}: {
  children: ReactNode;
  variant?: Variant;
}) {
  const v = VARIANT[variant];
  return (
    <div
      role="note"
      className="flex items-start gap-1.5 text-xs text-text-muted leading-[1.4] bg-surface-muted rounded-md px-2.5 py-2"
      style={{ borderLeft: `3px solid ${v.border}` }}
    >
      <span aria-hidden className="mt-px flex-shrink-0">
        {v.icon}
      </span>
      <span>{children}</span>
    </div>
  );
}
