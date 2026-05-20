import type { ReactNode } from 'react';

interface Props {
  onClick: () => void;
  children?: ReactNode;
}

export function GhostDeleteBtn({ onClick, children = '×' }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-auto border-none bg-transparent text-text-placeholder text-base leading-none cursor-pointer px-1 hover:text-error"
    >
      {children}
    </button>
  );
}
