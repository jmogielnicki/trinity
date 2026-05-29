import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { authConfigured } from '../../auth';
import { useAuthStore } from '../../store/authStore';
import { AuthModal } from './AuthModal';

const BTN =
  'flex items-center px-5 py-2.5 rounded-full text-md font-semibold cursor-pointer transition-opacity hover:opacity-90';

export function AuthControl() {
  const { status, user, refresh, signOut, authModalOpen, setAuthModalOpen } = useAuthStore();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Fixed-position coords for the dropdown. The account menu is portaled to
  // <body> because its in-header ancestor uses `overflow: hidden` (the
  // shrink-on-scroll animation), which would otherwise clip the dropdown.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Hydrate the session once on mount (idempotent under StrictMode).
  useEffect(() => {
    if (authConfigured) void refresh();
  }, [refresh]);

  // Close the menu on scroll/resize so it can't drift from the moving avatar.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, [menuOpen]);

  // Until the project is provisioned, no auth entry points are shown.
  if (!authConfigured) return null;
  if (status === 'loading') return null;

  if (status === 'authed' && user) {
    const initial = (user.name?.[0] ?? user.email[0] ?? '?').toUpperCase();
    const toggleMenu = () => {
      if (menuOpen) {
        setMenuOpen(false);
        return;
      }
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
      setMenuOpen(true);
    };
    return (
      <>
        <button
          ref={btnRef}
          className="w-7 h-7 flex-shrink-0 rounded-full border border-text-disabled bg-surface cursor-pointer text-xs font-semibold text-text-muted leading-none flex items-center justify-center hover:bg-surface-hover uppercase"
          onClick={toggleMenu}
          title={user.email}
          aria-label="Account"
        >
          {initial}
        </button>
        {menuOpen &&
          pos &&
          createPortal(
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setMenuOpen(false)} />
              <div
                className="fixed z-[61] min-w-[200px] bg-surface border border-border rounded-lg shadow-popover p-2 flex flex-col gap-1"
                style={{ top: pos.top, right: pos.right }}
              >
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
            </>,
            document.body,
          )}
      </>
    );
  }

  return (
    <>
      <button
        className={`${BTN} text-white bg-accent`}
        onClick={() => setAuthModalOpen(true)}
        title="Sign in or create an account"
      >
        Sign in
      </button>
      {authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}
    </>
  );
}
