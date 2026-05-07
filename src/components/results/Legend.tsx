import { OUTCOME } from '../colors';

type Item = { color: string; label: string; note?: string };

const SIM_LEGEND: Item[] = [
  { color: OUTCOME.survived, label: 'Survived', note: 'completed history, ended above $0' },
  { color: OUTCOME.depleted, label: 'Depleted', note: 'ran out of money before horizon' },
  { color: OUTCOME.inProgress, label: 'In-progress', note: "data ran out before horizon ended" },
];

export function Legend({
  items = SIM_LEGEND,
  className = '',
}: {
  items?: Item[];
  className?: string;
}) {
  return (
    <ul className={`legend-row ${className}`}>
      {items.map((it) => (
        <li key={it.label} title={it.note ?? ''}>
          <span className="sw" style={{ background: it.color }} />
          <span className="legend-label">{it.label}</span>
          {it.note && <span className="legend-note">— {it.note}</span>}
        </li>
      ))}
    </ul>
  );
}
