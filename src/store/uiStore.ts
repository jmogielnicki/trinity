import { create } from 'zustand';

/**
 * Editor disclosure level. 'simple' shows only the most approachable
 * allocation / withdrawal modes; 'advanced' reveals the full set. This is a
 * presentation-only concern — it never changes what the engine computes, only
 * which controls are offered. Persisted to localStorage so the choice sticks
 * across visits.
 */
export type EditorMode = 'simple' | 'advanced';

const KEY = 'trinity:editorMode';

function load(): EditorMode {
  try {
    return localStorage.getItem(KEY) === 'advanced' ? 'advanced' : 'simple';
  } catch {
    return 'simple';
  }
}

type UIState = {
  editorMode: EditorMode;
  setEditorMode: (m: EditorMode) => void;
};

export const useUIStore = create<UIState>((set) => ({
  editorMode: typeof window !== 'undefined' ? load() : 'simple',
  setEditorMode: (editorMode) => {
    try {
      localStorage.setItem(KEY, editorMode);
    } catch {
      // Private mode / storage disabled — keep the choice in memory only.
    }
    set({ editorMode });
  },
}));
