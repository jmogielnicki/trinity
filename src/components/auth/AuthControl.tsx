import { useEffect, useState } from 'react';
import { authConfigured } from '../../auth';
import { useAuthStore } from '../../store/authStore';
import { AuthModal } from './AuthModal';

const BTN =
  'flex items-center px-2.5 py-[5px] rounded-lg text-xs font-semibold cursor-pointer transition-opacity hover:opacity-90';

export function AuthControl() {
  const { status, user, refresh, signOut, authModalOpen, setAuthModalOpen } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);

  // Hydrate the session once on mount (idempotent under StrictMode).
  useEffect(() => {
    if (authConfigured) void refresh();
  }, [refresh]);

  // Until the project is provisioned, no auth entry points are shown.
  if (!authConfigured) return null;
  if (status === 'loading') return null;

  if (status === 'authed' && user) {
    const initial = (user.name?.[0] ?? user.email[0] ?? '?').toUpperCase();
    return (
      <div className="relative">
        <button
          className="w-7 h-7 flex-shrink-0 rounded-full border border-text-disabled bg-surface cursor-pointer text-xs font-semibold text-text-muted leading-none flex items-center justify-center hover:bg-surface-hover uppercase"
          onClick={() => setMenuOpen((v) => !v)}
          title={user.email}
          aria-label="Account"
        >
          {initial}
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-9 z-50 min-w-[200px] bg-surface border border-border rounded-lg shadow-popover p-2 flex flex-col gap-1">
              <div className="px-2 py-1 text-xs text-text-muted truncate" title={user.email}>
                {user.email}
              </div>
              <button
                className="text-left px-2 py-1.5 rounded text-sm text-text hover:bg-surface-hover cursor-pointer"
                onClick={async () => {
                  setMenuOpen(false);
                  await signOut();
                }}
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        className={`${BTN} text-text-secondary border border-border bg-surface`}
        onClick={() => setAuthModalOpen(true)}
        title="Sign in or create an account"
      >
        Sign in
      </button>
      {authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}
    </>
  );
}
