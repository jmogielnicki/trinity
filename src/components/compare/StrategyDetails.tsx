import { Fragment } from 'react';
import type { AllocationStrategy, WithdrawalStrategy } from '../../engine/strategies';
import type { WithdrawalSource } from '../../engine/withdrawalSource';
import {
  allocTypeName,
  wdTypeName,
  srcTypeName,
  allocRows,
  wdRows,
  srcRows,
} from '../../engine/strategyDescriptions';

function Section({
  label,
  type,
  rows,
}: {
  label: string;
  type: string;
  rows: [string, string][];
}) {
  return (
    <>
      <div className="col-span-2 mt-1.5 first:mt-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </span>
        <span className="ml-1 text-2xs text-text-secondary">— {type}</span>
      </div>
      {rows.map(([k, v]) => (
        <Fragment key={k}>
          <div className="text-text-muted">{k}</div>
          <div className="text-text font-medium truncate">{v}</div>
        </Fragment>
      ))}
    </>
  );
}

export function StrategyDetails({
  allocation,
  withdrawal,
  withdrawalSource,
  className = 'text-2xs',
}: {
  allocation: AllocationStrategy;
  withdrawal: WithdrawalStrategy;
  withdrawalSource?: WithdrawalSource;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-[auto_1fr] gap-x-2 gap-y-px items-baseline ${className}`}>
      <Section label="Allocation" type={allocTypeName(allocation)} rows={allocRows(allocation)} />
      <Section label="Withdrawal" type={wdTypeName(withdrawal)} rows={wdRows(withdrawal)} />
      <Section label="Source" type={srcTypeName(withdrawalSource)} rows={srcRows(withdrawalSource)} />
    </div>
  );
}
