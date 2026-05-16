import type { ScenarioResult } from '../../engine/types';

/**
 * Editorial hero — success rate rendered at display scale with a
 * survived / depleted breakdown bar and three meta stats.
 */
export function HeroCard({
  result,
  horizonYears,
}: {
  result: ScenarioResult;
  horizonYears: number;
}) {
  let survived = 0;
  let failed = 0;
  let inProgress = 0;
  for (const s of result.sims) {
    const w = s.weight ?? 1;
    if (s.inProgress) inProgress += w;
    else if (!s.success) failed += w;
    else survived += w;
  }
  const total = survived + failed + inProgress;

  const pctNum = Number.isFinite(result.successRate)
    ? result.successRate * 100
    : NaN;
  const pct = Number.isFinite(pctNum) ? pctNum.toFixed(1) : '—';
  const [whole, frac] = pct.split('.');

  return (
    <div className="hero-card">
      <div className="hero-label">Success rate · {horizonYears}-year horizon</div>
      <div className="hero-num">
        {whole}
        {frac != null && <span className="frac">.{frac}</span>}
        <span className="pct">%</span>
      </div>
      <div className="hero-sub">
        Of <b>{Math.round(total)}</b> historical cohorts,{' '}
        <b>{Math.round(survived)}</b> would have survived a {horizonYears}-year
        retirement on this plan.
      </div>
      <div className="progress">
        {survived > 0 && <span className="ok" style={{ flex: survived }} />}
        {inProgress > 0 && (
          <span className="warn" style={{ flex: inProgress }} />
        )}
        {failed > 0 && <span className="fail" style={{ flex: failed }} />}
      </div>
      <div className="hero-meta">
        <div>
          <div className="k">
            <span className="swatch" style={{ background: 'var(--forest)' }} />
            Survives
          </div>
          <div className="v">
            {Math.round(survived)} <small>cohorts</small>
          </div>
        </div>
        <div>
          <div className="k">
            <span className="swatch" style={{ background: 'var(--clay)' }} />
            Depletes
          </div>
          <div className="v">
            {Math.round(failed)} <small>cohorts</small>
          </div>
        </div>
        <div>
          <div className="k">
            <span className="swatch" style={{ background: 'var(--wheat)' }} />
            {inProgress > 0 ? 'In progress' : 'Worst start'}
          </div>
          <div className="v">
            {inProgress > 0
              ? `${Math.round(inProgress)}`
              : (result.worstStartYear ?? '—')}
            {inProgress > 0 && <small> cohorts</small>}
          </div>
        </div>
      </div>
    </div>
  );
}
