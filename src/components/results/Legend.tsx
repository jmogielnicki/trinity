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
    <ul className={`list-none p-0 mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-text-secondary ${className}`}>
      {items.map((it) => (
        <li key={it.label} title={it.note ?? ''} className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: it.color }} />
          <span className="font-medium">{it.label}</span>
          {it.note && <span className="text-text-faint">— {it.note}</span>}
        </li>
      ))}
    </ul>
  );
}
