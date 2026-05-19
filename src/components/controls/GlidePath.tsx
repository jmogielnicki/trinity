import { useState, useEffect } from 'react';
import type { AllocationStrategy } from '../../engine/strategies';
import type { Weights } from '../../engine/types';
import { ASSET } from '../colors';
import { StackedBar } from './StackedBar';

type Props = {
  horizonYears: number;
  allocation: AllocationStrategy;
  onChange: (a: AllocationStrategy) => void;
  width?: number;
  height?: number;
};

type Endpoints = { start: Weights; end: Weights };

function allocToEndpoints(a: AllocationStrategy): Endpoints {
  if (a.type === 'static')    return { start: a.weights, end: a.weights };
  if (a.type === 'glidepath') return { start: a.start,   end: a.end };
  return { start: { stock: 0.6, bond: 0.4, cash: 0 }, end: { stock: 0.6, bond: 0.4, cash: 0 } };
}

function endpointsToAllocation(ep: Endpoints, horizonYears: number): AllocationStrategy {
  const same =
    ep.start.stock === ep.end.stock &&
    ep.start.bond  === ep.end.bond  &&
    ep.start.cash  === ep.end.cash;
  if (same) return { type: 'static', weights: ep.start };
  return { type: 'glidepath', start: ep.start, end: ep.end, transitionYears: horizonYears };
}

export function GlidePath({ horizonYears, allocation, onChange, width = 280, height = 200 }: Props) {
  const [ep, setEp] = useState<Endpoints>(() => allocToEndpoints(allocation));

  useEffect(() => { setEp(allocToEndpoints(allocation)); }, [allocation]);

  const handleChange = (ws: Weights[]) => {
    const next = { start: ws[0], end: ws[1] };
    setEp(next);
    onChange(endpointsToAllocation(next, horizonYears));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-[#444]">
        Glide path — drag the band boundaries at year 0 (left) and year {horizonYears} (right).
      </div>
      <StackedBar
        weights={[ep.start, ep.end]}
        columnLabels={['year 0', `year ${horizonYears}`]}
        onChange={handleChange}
        width={width}
        height={height}
      />
      <div className="flex gap-3 text-xs text-text-secondary">
        <span><span className="inline-block w-[10px] h-[10px] align-middle mr-1 rounded-sm" style={{ background: ASSET.stock }} /> stocks</span>
        <span><span className="inline-block w-[10px] h-[10px] align-middle mr-1 rounded-sm" style={{ background: ASSET.bond }} /> bonds</span>
        <span><span className="inline-block w-[10px] h-[10px] align-middle mr-1 rounded-sm" style={{ background: ASSET.cash }} /> cash</span>
      </div>
    </div>
  );
}
