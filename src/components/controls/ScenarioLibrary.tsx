import { authConfigured } from '../../auth';
import { useAuthStore } from '../../store/authStore';
import { useLibraryStore, type SavedScenario } from '../../store/libraryStore';
import { useScenarioStore } from '../../store/scenarioStore';
import { useSweepStore } from '../../store/sweepStore';
import { GhostDeleteBtn } from '../ui/GhostDeleteBtn';

export function ScenarioLibrary() {
  const scenario = useScenarioStore();
  const sweep = useSweepStore();
  const { saved, source, loading, error, localPending, remove, migrateLocalToCloud, dismissMigration } =
    useLibraryStore();
  const setAuthModalOpen = useAuthStore((s) => s.setAuthModalOpen);

  const onLoad = (s: SavedScenario) => {
    scenario.setBalance(s.state.initialBalance);
    scenario.setHorizon(s.state.horizonYears);
    scenario.setAllocation(s.state.allocation);
    scenario.setWithdrawal(s.state.withdrawal);
    if (s.state.tailMethod) scenario.setTailMethod(s.state.tailMethod);
    if (s.state.withdrawalSource)
      scenario.setWithdrawalSource(s.state.withdrawalSource);
    (Object.keys(s.state.axes) as Array<keyof typeof s.state.axes>).forEach(
      (a) => sweep.setAxis(a, s.state.axes[a]),
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-text-secondary">Saved scenarios</div>
        {source === 'cloud' && (
          <span className="text-2xs text-text-faint uppercase tracking-wide">cloud</span>
        )}
      </div>

      {/* One-time offer to upload on-device scenarios after signing in. */}
      {source === 'cloud' && localPending > 0 && (
        <div className="text-xs bg-surface-panel rounded-md p-2 flex flex-col gap-1.5">
          <span className="text-text-secondary">
            You have {localPending} scenario{localPending === 1 ? '' : 's'} saved on this device.
          </span>
          <div className="flex gap-2">
            <button
              className="px-2 py-1 rounded text-2xs font-semibold text-white bg-secondary cursor-pointer hover:opacity-90"
              onClick={() => void migrateLocalToCloud().catch(() => {})}
            >
              Upload to account
            </button>
            <button
              className="px-2 py-1 rounded text-2xs font-medium text-text-muted hover:bg-surface-hover cursor-pointer"
              onClick={dismissMigration}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {error && <div className="text-xs text-error">{error}</div>}

      {loading && saved.length === 0 ? (
        <div className="text-xs text-text-faint">loading…</div>
      ) : saved.length === 0 ? (
        <div className="text-xs text-text-faint">no saved scenarios yet</div>
      ) : (
        <ul className="list-none p-0 m-0 flex flex-col gap-1">
          {saved.map((s) => (
            <li key={s.id} className="flex items-center">
              <button className="flex-1 text-left bg-surface-hover border border-border-light rounded-[3px] px-2 py-1 cursor-pointer text-sm hover:bg-surface-code" onClick={() => onLoad(s)}>
                {s.name}
              </button>
              <GhostDeleteBtn onClick={() => void remove(s.id).catch(() => {})} />
            </li>
          ))}
        </ul>
      )}

      {/* Nudge anonymous users with on-device scenarios to create an account. */}
      {source === 'local' && authConfigured && saved.length > 0 && (
        <div className="text-xs text-text-muted">
          Saved on this device.{' '}
          <button
            className="text-secondary font-medium hover:underline cursor-pointer bg-transparent border-none p-0"
            onClick={() => setAuthModalOpen(true)}
          >
            Sign up
          </button>{' '}
          to keep them in your account.
        </div>
      )}
    </div>
  );
}
