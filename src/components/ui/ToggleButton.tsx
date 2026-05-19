import type { ReactNode } from 'react';

interface Props {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}

export function ToggleButton({ active, onClick, children, className }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-2.5 py-1 border-none rounded-md cursor-pointer font-medium font-[inherit] transition-[background,color,box-shadow] duration-[120ms] whitespace-nowrap flex-shrink-0 ${active ? 'bg-surface shadow-card text-text' : 'bg-transparent text-text-muted'}${className ? ' ' + className : ''}`}
    >
      {children}
    </button>
  );
}
