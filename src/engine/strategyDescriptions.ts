import type { AllocationStrategy, WithdrawalStrategy } from './strategies';
import type { WithdrawalSource } from './withdrawalSource';

export function pct(n: number): string {
  return `${(n * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}

// ── Compact single-line descriptions (used in comparison tables, default names) ─

export function describeWithdrawal(w: WithdrawalStrategy): string {
  switch (w.type) {
    case 'fixedPercent':       return `${pct(w.rate)} fixed`;
    case 'fixedDollar':        return `${fmtMoney(w.amount)}/yr`;
    case 'percentOfBalance':   return `${pct(w.rate)} of balance`;
    case 'floorAndUpside':     return `${pct(w.floor)} floor + upside`;
    case 'piecewise':          return 'piecewise';
    case 'piecewiseLinear':    return 'curve';
    case 'guardrails':         return `guardrails ${pct(w.base)}`;
    case 'ruleBased':          return `rule-based ${pct(w.base)}`;
    case 'capeWithdrawal':     return `CAPE (a=${pct(w.a)}, b=${w.b})`;
    case 'ratchet':            return `ratchet ${pct(w.baseRate)} +${pct(w.stepBoost)}/${pct(w.stepSize)}`;
    case 'endowment':          return `endowment ${pct(w.rate)} / ${w.lookbackYears}yr avg`;
    case 'vanguardDynamic':    return `Vanguard dynamic ${pct(w.rate)}`;
    case 'custom':
    case 'customSrc':          return 'custom';
  }
}

export function describeAllocation(a: AllocationStrategy): string {
  switch (a.type) {
    case 'static': {
      const w = a.weights;
      return `${Math.round(w.stock * 100)}/${Math.round(w.bond * 100)}/${Math.round(w.cash * 100)}`;
    }
    case 'glidepath':    return `glide ${Math.round(a.start.stock * 100)}→${Math.round(a.end.stock * 100)}% stk`;
    case 'linearDrift':  return 'linear drift';
    case 'ageInBonds':   return `age-in-bonds (${a.currentAge})`;
    case 'risingEquity': return `rising ${Math.round(a.start.stock * 100)}→${Math.round(a.end.stock * 100)}% stk`;
    case 'ruleBased':    return 'rule-based';
    case 'custom':
    case 'customSrc':    return 'custom';
  }
}

const DEFAULT_SOURCE: WithdrawalSource = { type: 'proportional', rebalance: true };

export function describeSource(s?: WithdrawalSource): string {
  const src = s ?? DEFAULT_SOURCE;
  switch (src.type) {
    case 'proportional': return src.rebalance ? 'proportional, rebalanced' : 'proportional, drift';
    case 'waterfall':    return `waterfall ${src.order.join('→')}`;
    case 'bucket':       return `bucket ${src.order.join('→')}`;
  }
}

// ── Detailed breakdown for the save modal ────────────────────────────────────

export function allocTypeName(a: AllocationStrategy): string {
  switch (a.type) {
    case 'static':       return 'Static';
    case 'glidepath':    return 'Glide path';
    case 'linearDrift':  return 'Linear drift';
    case 'ageInBonds':   return 'Age in bonds';
    case 'risingEquity': return 'Rising equity';
    case 'ruleBased':    return 'Rule-based';
    case 'custom':
    case 'customSrc':    return 'Custom';
  }
}

export function srcTypeName(s?: WithdrawalSource): string {
  const src = s ?? DEFAULT_SOURCE;
  switch (src.type) {
    case 'proportional': return 'Proportional';
    case 'waterfall':    return 'Waterfall';
    case 'bucket':       return 'Bucket';
  }
}

export function wdTypeName(w: WithdrawalStrategy): string {
  switch (w.type) {
    case 'fixedPercent':     return 'Fixed % of initial';
    case 'fixedDollar':      return 'Fixed dollar';
    case 'percentOfBalance': return '% of balance';
    case 'floorAndUpside':   return 'Floor + upside';
    case 'piecewise':        return 'Piecewise';
    case 'piecewiseLinear':  return 'Custom curve';
    case 'guardrails':       return 'Guardrails';
    case 'ruleBased':        return 'Rule-based';
    case 'capeWithdrawal':   return 'CAPE rule';
    case 'ratchet':          return 'Ratchet';
    case 'endowment':        return 'Endowment';
    case 'vanguardDynamic':  return 'Vanguard dynamic';
    case 'custom':
    case 'customSrc':        return 'Custom';
  }
}

/** Returns [label, value] pairs describing every meaningful parameter. */
export function allocRows(a: AllocationStrategy): [string, string][] {
  switch (a.type) {
    case 'static': {
      const s = Math.round(a.weights.stock * 100);
      const b = Math.round(a.weights.bond * 100);
      const c = Math.round(a.weights.cash * 100);
      const rows: [string, string][] = [['Stocks', `${s}%`], ['Bonds', `${b}%`]];
      if (c > 0) rows.push(['Cash', `${c}%`]);
      return rows;
    }
    case 'glidepath': {
      const s0 = Math.round(a.start.stock * 100);
      const s1 = Math.round(a.end.stock * 100);
      const b0 = Math.round(a.start.bond * 100);
      const b1 = Math.round(a.end.bond * 100);
      const c0 = Math.round(a.start.cash * 100);
      const c1 = Math.round(a.end.cash * 100);
      const rows: [string, string][] = [
        ['Stocks', `${s0}% → ${s1}%`],
        ['Bonds',  `${b0}% → ${b1}%`],
      ];
      if (c0 > 0 || c1 > 0) rows.push(['Cash', `${c0}% → ${c1}%`]);
      rows.push(['Transition', `over ${a.transitionYears} years`]);
      return rows;
    }
    case 'linearDrift': {
      const rows: [string, string][] = [
        ['Start stocks', `${Math.round(a.start.stock * 100)}%`],
        ['Start bonds',  `${Math.round(a.start.bond * 100)}%`],
        ['Drift stocks', `${pct(a.driftPerYear.stock)}/yr`],
        ['Drift bonds',  `${pct(a.driftPerYear.bond)}/yr`],
      ];
      const sc = Math.round(a.start.cash * 100);
      if (sc > 0 || a.driftPerYear.cash !== 0) {
        rows.push(['Start cash', `${sc}%`]);
        rows.push(['Drift cash', `${pct(a.driftPerYear.cash)}/yr`]);
      }
      return rows;
    }
    case 'ageInBonds':
      return [['Current age', `${a.currentAge}`]];
    case 'risingEquity': {
      const s0 = Math.round(a.start.stock * 100);
      const s1 = Math.round(a.end.stock * 100);
      const b0 = Math.round(a.start.bond * 100);
      const b1 = Math.round(a.end.bond * 100);
      const rows: [string, string][] = [
        ['Stocks', `${s0}% → ${s1}%`],
        ['Bonds',  `${b0}% → ${b1}%`],
        ['Over',   `${a.years} years`],
      ];
      return rows;
    }
    case 'ruleBased':
      return [
        ['Base stocks', `${Math.round(a.base.stock * 100)}%`],
        ['Base bonds',  `${Math.round(a.base.bond * 100)}%`],
        ['Rules',       `${a.rules.length}`],
      ];
    case 'custom':
    case 'customSrc':
      return [['Formula', 'Custom JS function']];
  }
}

export function wdRows(w: WithdrawalStrategy): [string, string][] {
  switch (w.type) {
    case 'fixedPercent':
      return [['Rate', `${pct(w.rate)} of initial (inflation-adj.)`]];
    case 'fixedDollar':
      return [['Amount', `$${w.amount.toLocaleString()}/yr (real $)`]];
    case 'percentOfBalance':
      return [
        ['Rate',  `${pct(w.rate)} of current balance`],
        ['Floor', `${pct(w.floor)} of initial`],
      ];
    case 'floorAndUpside':
      return [
        ['Floor',   `${pct(w.floor)} of initial`],
        ['Upside',  `${pct(w.upsideRate)} of current balance`],
      ];
    case 'piecewise': {
      const rates = w.pieces.map(p => pct(p.rate));
      const rateStr = rates.length <= 5
        ? rates.join(' → ')
        : `${rates[0]} → … → ${rates[rates.length - 1]}`;
      return [
        ['Segments', `${w.pieces.length}`],
        ['Rates',    rateStr],
      ];
    }
    case 'piecewiseLinear': {
      const pts = w.points;
      return [
        ['Control points', `${pts.length}`],
        ['Rate range',     `${pct(pts[0].rate)} → ${pct(pts[pts.length - 1].rate)}`],
      ];
    }
    case 'guardrails':
      return [
        ['Base rate', pct(w.base)],
        ['Floor',     pct(w.floor)],
        ['Ceiling',   pct(w.ceiling)],
        ['Trigger',   `${pct(w.trigger)} portfolio drift`],
      ];
    case 'ruleBased':
      return [
        ['Base rate', pct(w.base)],
        ['Rules',     `${w.rules.length}`],
      ];
    case 'capeWithdrawal':
      return [
        ['Formula',       `${pct(w.a)} + ${w.b} ÷ CAPE`],
        ['Fallback CAPE', `${w.fallbackCape}`],
      ];
    case 'ratchet':
      return [
        ['Base rate',     pct(w.baseRate)],
        ['Step trigger',  `every ${pct(w.stepSize)} portfolio gain`],
        ['Step boost',    `+${pct(w.stepBoost)} of initial spending`],
      ];
    case 'endowment':
      return [
        ['Rate',  `${pct(w.rate)} of ${w.lookbackYears}-year avg balance`],
        ['Floor', `${pct(w.floorFraction)} of prior withdrawal`],
      ];
    case 'vanguardDynamic':
      return [
        ['Rate',         `${pct(w.rate)} of current balance`],
        ['Max increase', `+${pct(w.ceiling)}/yr`],
        ['Max decrease', `${pct(Math.abs(w.floor))}/yr`],
      ];
    case 'custom':
    case 'customSrc':
      return [['Formula', 'Custom JS function']];
  }
}

export function srcRows(s?: WithdrawalSource): [string, string][] {
  const src = s ?? DEFAULT_SOURCE;
  switch (src.type) {
    case 'proportional':
      return [['Rebalance', src.rebalance ? 'To target yearly' : 'No — sleeves drift']];
    case 'waterfall':
      return [['Spend order', src.order.join(' → ')]];
    case 'bucket': {
      const rows: [string, string][] = [['Spend order', src.order.join(' → ')]];
      src.refill.forEach((r) =>
        rows.push(['Refill', `${r.sourceSleeve} → ${r.targetSleeve}`]),
      );
      return rows;
    }
  }
}
