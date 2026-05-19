import type { CandidateResult } from '../../engine/optimize';
import { SpaghettiChart } from '../results/SpaghettiChart';

/** Small-multiple trajectory fans, one per swept variant (1D studies only). */
export function StudyTrajectories({ results }: { results: CandidateResult[] }) {
  if (results.length === 0) return null;
  return (
    <div>
      <div className="heatmap-meta">
        Trajectory fan per variant — every historical start year, failures in
        red.
      </div>
      <div className="multiples-grid">
        {results.map((cr) => (
          <div key={cr.candidate.id} className="multiple">
            <div className="multiple-title">
              {cr.candidate.label} —{' '}
              {Number.isFinite(cr.metrics.successRate)
                ? `${(cr.metrics.successRate * 100).toFixed(0)}%`
                : '—'}
            </div>
            <SpaghettiChart result={cr.result} height={160} />
          </div>
        ))}
      </div>
    </div>
  );
}
