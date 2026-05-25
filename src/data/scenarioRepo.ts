import { neon } from '../auth';
import type { SerializedState } from './urlState';

export type SavedScenario = {
  id: string;
  name: string;
  state: SerializedState;
  savedAt: number;
};

export interface ScenarioRepo {
  list(): Promise<SavedScenario[]>;
  save(name: string, state: SerializedState): Promise<void>;
  remove(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Local repo — localStorage, for anonymous users (unchanged semantics).
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'trinity:scenarios';
const MAX_LOCAL = 50;

function loadLocal(): SavedScenario[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedScenario[];
  } catch {
    return [];
  }
}

function persistLocal(s: SavedScenario[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // quota / private mode — silently drop
  }
}

export const localRepo: ScenarioRepo & { all: () => SavedScenario[] } = {
  all: loadLocal,
  list: async () => loadLocal(),
  save: async (name, state) => {
    const next: SavedScenario = {
      id: crypto.randomUUID(),
      name: name.trim() || 'untitled',
      state,
      savedAt: Date.now(),
    };
    persistLocal([next, ...loadLocal()].slice(0, MAX_LOCAL));
  },
  remove: async (id) => {
    persistLocal(loadLocal().filter((s) => s.id !== id));
  },
};

// ---------------------------------------------------------------------------
// Cloud repo — Neon Data API. RLS scopes every row to the signed-in user, so
// no user_id is ever sent: the DB stamps it via the `auth.user_id()` default.
// ---------------------------------------------------------------------------
type Row = { id: number | string; name: string; state: SerializedState; saved_at: string };

function rowToScenario(r: Row): SavedScenario {
  return {
    id: String(r.id),
    name: r.name,
    state: r.state,
    savedAt: new Date(r.saved_at).getTime(),
  };
}

export const cloudRepo: ScenarioRepo & {
  saveMany: (items: { name: string; state: SerializedState }[]) => Promise<void>;
} = {
  list: async () => {
    const { data, error } = await neon
      .from('saved_scenarios')
      .select('id, name, state, saved_at')
      .order('saved_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Row[]).map(rowToScenario);
  },
  save: async (name, state) => {
    const { error } = await neon
      .from('saved_scenarios')
      .insert({ name: name.trim() || 'untitled', state });
    if (error) throw new Error(error.message);
  },
  remove: async (id) => {
    const { error } = await neon.from('saved_scenarios').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
  saveMany: async (items) => {
    if (items.length === 0) return;
    const rows = items.map((i) => ({ name: i.name.trim() || 'untitled', state: i.state }));
    const { error } = await neon.from('saved_scenarios').insert(rows);
    if (error) throw new Error(error.message);
  },
};
