import type { AllocationStrategy, WithdrawalStrategy } from '../engine/strategies';
import type { TailMethod } from '../engine/sweep';
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
  tailMethod?: TailMethod;
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

/**
 * URL-loaded customSrc strategies are evaluated as JS in the user's browser
 * with full page privileges (we use new Function, no sandbox). A malicious
 * shared link could ship a payload, so we ask before applying. Returns
 * a state with any unapproved customSrc replaced by safe defaults.
 */
export function gateCustomSrc(
  state: SerializedState,
  confirmFn: (src: string, where: 'allocation' | 'withdrawal') => boolean,
): SerializedState {
  const out: SerializedState = { ...state };
  if (out.allocation.type === 'customSrc') {
    if (!confirmFn(out.allocation.src, 'allocation')) {
      out.allocation = {
        type: 'static',
        weights: { stock: 0.6, bond: 0.4, cash: 0 },
      };
    }
  }
  if (out.withdrawal.type === 'customSrc') {
    if (!confirmFn(out.withdrawal.src, 'withdrawal')) {
      out.withdrawal = { type: 'fixedPercent', rate: 0.04 };
    }
  }
  return out;
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
