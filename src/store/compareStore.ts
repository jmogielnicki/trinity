import { create } from 'zustand';
import type { ScenarioResult } from '../engine/types';

export type Snapshot = {
  label: string;
  result: ScenarioResult;
  /** Color to render this snapshot in. */
  color: string;
};

export type CompareState = {
  snapshot: Snapshot | null;
  setSnapshot: (s: Snapshot | null) => void;
};

export const useCompareStore = create<CompareState>((set) => ({
  snapshot: null,
  setSnapshot: (snapshot) => set({ snapshot }),
}));

import { OUTCOME } from '../components/colors';

export const SNAPSHOT_COLOR = OUTCOME.snapshot;
export const CURRENT_COLOR = OUTCOME.survived;
