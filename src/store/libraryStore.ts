import { create } from 'zustand';
import type { SerializedState } from '../data/urlState';

const STORAGE_KEY = 'trinity:scenarios';

export type SavedScenario = {
  id: string;
  name: string;
  state: SerializedState;
  savedAt: number;
};

type LibraryState = {
  saved: SavedScenario[];
  save: (name: string, state: SerializedState) => void;
  remove: (id: string) => void;
};

function load(): SavedScenario[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedScenario[];
  } catch {
    return [];
  }
}

function persist(s: SavedScenario[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // quota / private mode — silently drop
  }
}

export const useLibraryStore = create<LibraryState>((set) => ({
  saved: typeof window !== 'undefined' ? load() : [],
  save: (name, state) =>
    set((prev) => {
      const next: SavedScenario = {
        id: crypto.randomUUID(),
        name: name.trim() || 'untitled',
        state,
        savedAt: Date.now(),
      };
      const saved = [next, ...prev.saved].slice(0, 50);
      persist(saved);
      return { saved };
    }),
  remove: (id) =>
    set((prev) => {
      const saved = prev.saved.filter((s) => s.id !== id);
      persist(saved);
      return { saved };
    }),
}));
