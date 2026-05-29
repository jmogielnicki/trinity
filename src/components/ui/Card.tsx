import type { CSSProperties, ReactNode } from 'react';

/**
 * Surface container primitive. Replaces the repeated
 * `bg-surface border border-border rounded-lg p-4` strings so panel shape and
 * elevation live in one place.
 *
 *   variant  default  — white surface, hairline border (the common panel)
 *            muted    — warm-tint surface, no border (stat tiles, insets)
 *            elevated — white surface + card shadow (popovers, hero panels)
 *   pad      true (default) → p-4. Pass false when the caller owns padding.
 *
 * `as` lets callers render a <section>/<aside> etc. while keeping the styling.
 */
type Variant = 'default' | 'muted' | 'elevated';

interface Props {
  variant?: Variant;
  pad?: boolean;
  as?: 'div' | 'section' | 'aside' | 'article';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  default: 'bg-surface border border-border',
  muted: 'bg-surface-muted',
  elevated: 'bg-surface border border-border shadow-card',
};

export function Card({
  variant = 'default',
  pad = true,
  as: Tag = 'div',
  className,
  style,
  children,
}: Props) {
  const cls = [
    'rounded-lg',
    VARIANTS[variant],
    pad ? 'p-4' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Tag className={cls} style={style}>
      {children}
    </Tag>
  );
}
