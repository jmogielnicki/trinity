import type { ReactNode } from 'react';

interface Props {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
}

export function ToggleButton({ active, onClick, children, className, disabled, title }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`text-sm px-3.5 py-2 border-none rounded-md cursor-pointer font-semibold font-[inherit] transition-[background,color,box-shadow] duration-[120ms] whitespace-nowrap flex-shrink-0 ${active ? 'bg-surface shadow-card text-primary' : 'bg-transparent text-text-muted hover:text-text'}${className ? ' ' + className : ''}`}
    >
      {children}
    </button>
  );
}
