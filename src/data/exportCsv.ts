import type { ScenarioResult } from '../engine/types';

export function simsToCsv(result: ScenarioResult): string {
  const rows: string[] = [
    'start_year,t,balance,withdrawal,income,one_time,return,depleted',
  ];
  for (const s of result.sims) {
    for (const r of s.trajectory) {
      rows.push(
        [
          s.startYear,
          r.t,
          r.balance.toFixed(2),
          r.withdrawal.toFixed(2),
          r.income?.toFixed(2) ?? '',
          r.oneTime?.toFixed(2) ?? '',
          r.return?.toFixed(6) ?? '',
          r.depleted ? '1' : '',
        ].join(','),
      );
    }
  }
  return rows.join('\n');
}

export function downloadCsv(filename: string, body: string) {
  const blob = new Blob([body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
