import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { FIELD_FULL } from '../ui/fieldCls';

export function AuthModal({ onClose }: { onClose: () => void }) {
  const { signIn, signUp } = useAuthStore();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    const err =
      mode === 'signin'
        ? await signIn(email, password)
        : await signUp(name.trim() || email.split('@')[0] || 'User', email, password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface rounded-xl shadow-popover w-full max-w-[380px] flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-lg font-bold text-text">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </h2>
          <IconButton onClick={onClose} aria-label="Close">✕</IconButton>
        </div>

        <div className="flex flex-col gap-3">
          {mode === 'signup' && (
            <label className="flex flex-col gap-1.5">
              <span className="text-base font-medium text-text-secondary">Name</span>
              <input
                type="text"
                className={FIELD_FULL}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-base font-medium text-text-secondary">Email</span>
            <input
              type="email"
              className={FIELD_FULL}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-base font-medium text-text-secondary">Password</span>
            <input
              type="password"
              className={FIELD_FULL}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="••••••••"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </label>
        </div>

        {error && <div className="text-sm text-error">{error}</div>}

        <Button fullWidth onClick={submit} disabled={busy || !email || !password}>
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </Button>

        <div className="text-sm text-text-muted text-center">
          {mode === 'signin' ? (
            <>
              No account?{' '}
              <button
                className="text-secondary font-medium hover:underline cursor-pointer bg-transparent border-none p-0"
                onClick={() => {
                  setError(null);
                  setMode('signup');
                }}
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                className="text-secondary font-medium hover:underline cursor-pointer bg-transparent border-none p-0"
                onClick={() => {
                  setError(null);
                  setMode('signin');
                }}
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
