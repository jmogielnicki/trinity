import type { ReactNode } from 'react';
import { Button } from './Button';

/**
 * Thin compatibility wrapper over the Button primitive for inline list actions
 * ("+ add rule", "apply", "Clear", …). Kept so existing call sites don't churn;
 * it just maps the old size names onto Button's `outline` variant. Prefer
 * <Button variant="outline"> directly in new code.
 */
interface Props {
  size?: 'sm' | 'md';
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  type?: 'button' | 'submit';
}

export function Btn({ size = 'sm', disabled, onClick, children, className, type = 'button' }: Props) {
  return (
    <Button
      variant="outline"
      size={size === 'md' ? 'md' : 'sm'}
      disabled={disabled}
      onClick={onClick}
      type={type}
      className={size === 'sm' ? `self-start${className ? ' ' + className : ''}` : className}
    >
      {children}
    </Button>
  );
}
