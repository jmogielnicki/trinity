import type { ReactNode } from 'react';

interface Props {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

const BASE =
  'bg-transparent border-0 border-b-[3px] border-solid px-2.5 py-2.5 sm:px-4 sm:py-3 text-[15px] font-semibold cursor-pointer -mb-px whitespace-nowrap flex-shrink-0 flex items-center gap-2';
const ACTIVE = 'text-primary border-b-primary';
const INACTIVE = 'text-text-muted border-b-transparent hover:text-text';

export function NavTab({ active, onClick, children }: Props) {
  return (
    <button type="button" className={`${BASE} ${active ? ACTIVE : INACTIVE}`} onClick={onClick}>
      {children}
    </button>
  );
}
