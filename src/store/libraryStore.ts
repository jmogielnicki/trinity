import { create } from 'zustand';
import type { SerializedState } from '../data/urlState';
import { cloudRepo, localRepo, type SavedScenario } from '../data/scenarioRepo';
import { useAuthStore } from './authStore';

export type { SavedScenario };

// Set once the user has been offered (and accepted or dismissed) the one-time
// upload of their on-device scenarios to their account.
const MIGRATED_KEY = 'trinity:migrated';

function isAuthed(): boolean {
  return useAuthStore.getState().status === 'authed';
}
function activeRepo() {
  return isAuthed() ? cloudRepo : localRepo;
}
function migrated(): boolean {
  try {
    return localStorage.getItem(MIGRATED_KEY) === '1';
  } catch {
    return false;
  }
}
function markMigrated() {
  try {
    localStorage.setItem(MIGRATED_KEY, '1');
  } catch {
    // ignore
  }
}

type LibraryState = {
  saved: SavedScenario[];
  source: 'local' | 'cloud';
  loading: boolean;
  error: string | null;
  /** # of on-device scenarios offered for migration (authed users only). */
  localPending: number;
  refresh: () => Promise<void>;
  save: (name: string, state: SerializedState) => Promise<void>;
  remove: (id: string) => Promise<void>;
  migrateLocalToCloud: () => Promise<void>;
  dismissMigration: () => void;
};

// Monotonic id so a slower refresh can't clobber a newer one.
let reqId = 0;

export const useLibraryStore = create<LibraryState>((set, get) => ({
  // Anonymous users see their local scenarios instantly — no async needed.
  saved: typeof window !== 'undefined' ? localRepo.all() : [],
  source: 'local',
  loading: false,
  error: null,
  localPending: 0,

  refresh: async () => {
    const authed = isAuthed();
    const source: 'local' | 'cloud' = authed ? 'cloud' : 'local';
    const id = ++reqId;
    set({ loading: true, error: null });
    try {
      const saved = await activeRepo().list();
      if (id !== reqId) return; // superseded by a newer refresh
      const localPending = authed && !migrated() ? localRepo.all().length : 0;
      set({ saved, source, loading: false, localPending });
    } catch (e) {
      if (id !== reqId) return;
      set({ loading: false, error: (e as Error).message });
    }
  },

  save: async (name, state) => {
    try {
      await activeRepo().save(name, state);
      await get().refresh();
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  remove: async (id) => {
    try {
      await activeRepo().remove(id);
      await get().refresh();
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  migrateLocalToCloud: async () => {
    try {
      const items = localRepo.all().map((s) => ({ name: s.name, state: s.state }));
      await cloudRepo.saveMany(items);
      markMigrated();
      set({ localPending: 0 });
      await get().refresh();
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  dismissMigration: () => {
    markMigrated();
    set({ localPending: 0 });
  },
}));

// Reload the library whenever auth flips (sign in/out) so the correct source
// (local vs cloud) is shown without a manual refresh.
let lastStatus = useAuthStore.getState().status;
useAuthStore.subscribe((s) => {
  if (s.status !== lastStatus) {
    lastStatus = s.status;
    void useLibraryStore.getState().refresh();
  }
});
