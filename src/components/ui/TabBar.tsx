import type { ReactNode } from 'react';

export function TabBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-0.5 bg-surface-muted rounded-lg p-[3px] overflow-x-auto scrollbar-none">
      {children}
    </div>
  );
}
