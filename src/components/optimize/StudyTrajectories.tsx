import type { CandidateResult } from '../../engine/optimize';
import { SpaghettiChart } from '../results/SpaghettiChart';

/** Small-multiple trajectory fans, one per swept variant (1D studies only). */
export function StudyTrajectories({ results }: { results: CandidateResult[] }) {
  if (results.length === 0) return null;
  return (
    <div>
      <div className="text-sm text-text-secondary mb-2">
        Trajectory fan per variant — every historical start year, failures in
        red.
      </div>
      <div className="grid [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))] gap-3 mt-2">
        {results.map((cr) => (
          <div key={cr.candidate.id} className="border border-[#eee] rounded p-1.5">
            <div className="text-xs text-text-secondary mb-1">
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
