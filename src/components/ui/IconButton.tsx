import type { ReactNode } from 'react';

interface Props {
  onClick: () => void;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
  title?: string;
}

export function IconButton({ onClick, children, className, 'aria-label': ariaLabel, title }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer text-text-muted hover:bg-surface-hover border border-border text-base${className ? ' ' + className : ''}`}
    >
      {children}
    </button>
  );
}
