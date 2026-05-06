import type { AllocationStrategy, WithdrawalStrategy } from '../engine/strategies';
import type { Weights } from '../engine/types';
import type { Axis, AxisMode } from '../store/sweepStore';

/**
 * URL-shareable scenario + sweep state. We use a compact JSON blob in the
 * hash (so it doesn't hit servers). Functions in custom strategies can't
 * round-trip — they're skipped on serialize.
 */
export type SerializedState = {
  initialBalance: number;
  horizonYears: number;
  allocation: AllocationStrategy;
  withdrawal: WithdrawalStrategy;
  axes: Record<Axis, AxisMode>;
};

const HASH_KEY = 's=';

export function serialize(state: SerializedState): string {
  const safe = JSON.stringify(state, (_k, v) =>
    typeof v === 'function' ? undefined : v,
  );
  return HASH_KEY + btoa(unescape(encodeURIComponent(safe)));
}

export function tryDeserialize(hash: string): SerializedState | null {
  if (!hash.startsWith('#' + HASH_KEY) && !hash.startsWith(HASH_KEY)) return null;
  const raw = hash.replace(/^#/, '').slice(HASH_KEY.length);
  if (!raw) return null;
  try {
    const json = decodeURIComponent(escape(atob(raw)));
    return JSON.parse(json) as SerializedState;
  } catch {
    return null;
  }
}

export function isValidWeights(w: unknown): w is Weights {
  return (
    typeof w === 'object' &&
    w !== null &&
    typeof (w as Weights).stock === 'number' &&
    typeof (w as Weights).bond === 'number' &&
    typeof (w as Weights).cash === 'number'
  );
}
