import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

/**
 * The one button primitive. Every clickable action that looks like a button
 * routes through here so the brand/shape/states live in one place — change a
 * variant once and it flows everywhere.
 *
 *   variant  primary  — filled brand CTA, white text (Save, Sign in, Run)
 *            ghost    — bordered, surface bg, muted text (Cancel / secondary)
 *            soft     — tinted brand wash, brand text (low-emphasis action)
 *            outline  — subtle hairline outline (inline list actions; the old Btn)
 *   size     sm / md / lg
 *
 * `elevated` adds a drop shadow (footer CTA). `fullWidth` stretches to 100%.
 * className is appended last so call sites can still tweak per-instance.
 */
type Variant = 'primary' | 'ghost' | 'soft' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  elevated?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 font-[inherit] cursor-pointer whitespace-nowrap ' +
  'transition-[background,color,box-shadow,opacity] duration-150 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:opacity-90 active:opacity-80',
  ghost:
    'bg-surface text-text-secondary border border-border hover:bg-surface-hover',
  soft: 'bg-brand-soft text-primary hover:brightness-[0.97] active:brightness-95',
  outline:
    'bg-surface text-text border border-border-input hover:bg-surface-hover hover:border-border-hover',
};

const SIZES: Record<Size, string> = {
  sm: 'text-sm px-2.5 py-1 rounded-md',
  md: 'text-md font-semibold px-4 py-2 rounded-lg',
  lg: 'text-md font-semibold px-5 py-3 rounded-xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  elevated,
  type = 'button',
  className,
  children,
  ...rest
}: Props) {
  const cls = [
    BASE,
    VARIANTS[variant],
    SIZES[size],
    fullWidth ? 'w-full' : '',
    elevated ? 'shadow-sticky' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}
