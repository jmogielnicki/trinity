import type { ReactNode } from 'react';

interface Props {
  size?: 'sm' | 'md';
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  type?: 'button' | 'submit';
}

const SM =
  'text-sm px-2 py-1 border border-text-disabled bg-surface rounded-[3px] cursor-pointer self-start hover:bg-surface-hover';
const MD =
  'px-3 py-1.5 border border-text-disabled bg-surface rounded cursor-pointer text-sm hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed';

export function Btn({ size = 'sm', disabled, onClick, children, className, type = 'button' }: Props) {
  const base = size === 'md' ? MD : SM;
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${base}${className ? ' ' + className : ''}`}
    >
      {children}
    </button>
  );
}
