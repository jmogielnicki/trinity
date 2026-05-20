import type { ReactNode } from 'react';

interface Props {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

const BASE =
  'bg-transparent border-0 border-b-[3px] border-solid px-2 py-1.5 sm:px-3.5 sm:py-2 text-sm sm:text-base cursor-pointer -mb-px whitespace-nowrap flex-shrink-0 flex items-center gap-1.5';
const ACTIVE = 'text-chart-blue font-semibold border-b-chart-blue';
const INACTIVE = 'text-text-muted border-b-transparent hover:text-text';

export function NavTab({ active, onClick, children }: Props) {
  return (
    <button type="button" className={`${BASE} ${active ? ACTIVE : INACTIVE}`} onClick={onClick}>
      {children}
    </button>
  );
}
