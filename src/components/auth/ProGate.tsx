import { startCheckout } from '../../billing';
import { useAuthStore } from '../../store/authStore';

/**
 * Paywall panel shown in place of an advanced (Pro) tool for free/anonymous
 * users. NOTE: this gate is cosmetic by design — the underlying compute runs
 * client-side, so this is UX/entitlement signalling, not a security boundary
 * (see AUTH_PLAN.md §2). The only hard-enforced things are cloud save (RLS)
 * and the Pro flag itself (written only by the Stripe webhook).
 */
export function ProGate({ title, blurb }: { title: string; blurb: string }) {
  const authed = useAuthStore((s) => s.status === 'authed');
  const setAuthModalOpen = useAuthStore((s) => s.setAuthModalOpen);

  const onClick = () => {
    if (authed) void startCheckout();
    else setAuthModalOpen(true);
  };

  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-16 px-6">
      <span className="text-2xs font-semibold uppercase tracking-widest text-secondary">
        Pro feature
      </span>
      <h2 className="m-0 text-xl font-bold text-text">{title}</h2>
      <p className="m-0 max-w-[440px] text-base text-text-muted leading-relaxed">{blurb}</p>
      <button
        className="mt-1 px-5 py-2.5 rounded-lg text-md font-semibold text-white bg-secondary cursor-pointer hover:opacity-90 transition-opacity"
        onClick={onClick}
      >
        {authed ? 'Upgrade to Pro' : 'Sign in to upgrade'}
      </button>
    </div>
  );
}
