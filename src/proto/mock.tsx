/* Shared, theme-driven mock components for the styling prototypes.
   Every color/shape comes from CSS variables defined in proto.css, so the same
   components render three completely different looks just by switching the
   theme class on the page root. Layout uses Tailwind; color/shape use vars. */
import type { CSSProperties, ReactNode } from 'react';

const v = (name: string) => `var(--${name})`;

/* ── deterministic tiny RNG so the mock charts are stable across renders ── */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/* ───────────────────────────── Card ───────────────────────────── */
export function Card({
  children,
  className = '',
  style,
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  pad?: boolean;
}) {
  return (
    <div
      className={`${pad ? 'p-5 sm:p-6' : ''} ${className}`}
      style={{
        background: v('surface'),
        border: `1px solid ${v('border')}`,
        borderRadius: v('radius'),
        boxShadow: v('shadow-card'),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────── Eyebrow ─────────────────────────── */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      className="uppercase font-semibold"
      style={{ color: v('text-faint'), fontSize: 11, letterSpacing: '0.16em' }}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────── Pill ─────────────────────────── */
export function Pill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className="inline-flex items-center overflow-hidden"
      style={{
        borderRadius: v('radius-pill'),
        border: `1px solid ${v('border')}`,
        background: v('surface'),
      }}
    >
      <span
        className="uppercase font-semibold px-3 py-1.5"
        style={{
          fontSize: 10,
          letterSpacing: '0.12em',
          color: v('text-faint'),
          background: v('surface-2'),
        }}
      >
        {label}
      </span>
      <span
        className="proto-mono px-3 py-1.5 font-semibold"
        style={{ fontSize: 13, color: v('text') }}
      >
        {value}
      </span>
    </div>
  );
}

/* ─────────────────────────── Button ─────────────────────────── */
export function Button({
  children,
  variant = 'primary',
  className = '',
}: {
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'soft';
  className?: string;
}) {
  const styles: Record<string, CSSProperties> = {
    primary: {
      background: v('brand'),
      color: v('brand-ink'),
      border: '1px solid transparent',
      boxShadow: v('shadow-card'),
    },
    soft: {
      background: v('brand-soft'),
      color: v('brand'),
      border: `1px solid transparent`,
    },
    ghost: {
      background: 'transparent',
      color: v('text-muted'),
      border: `1px solid ${v('border-strong')}`,
    },
  };
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-2 font-semibold cursor-pointer transition-transform hover:-translate-y-px ${className}`}
      style={{
        fontSize: 14,
        padding: '10px 18px',
        borderRadius: v('radius-pill'),
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

/* ─────────────────────── Segmented control ─────────────────────── */
export function Segmented({
  options,
  active,
}: {
  options: string[];
  active: number;
}) {
  return (
    <div
      className="inline-flex w-full"
      style={{
        background: v('surface-2'),
        borderRadius: v('radius'),
        padding: 4,
        gap: 4,
      }}
    >
      {options.map((o, i) => (
        <div
          key={o}
          className="flex-1 text-center font-semibold cursor-pointer transition"
          style={
            i === active
              ? {
                  background: v('surface'),
                  color: v('brand'),
                  borderRadius: `calc(${v('radius')} - 4px)`,
                  boxShadow: v('shadow-card'),
                  fontSize: 13,
                  padding: '8px 6px',
                }
              : {
                  color: v('text-muted'),
                  fontSize: 13,
                  padding: '8px 6px',
                }
          }
        >
          {o}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────── Stat card ─────────────────────── */
export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1"
      style={{
        background: v('surface-2'),
        borderRadius: v('radius-sm'),
        padding: '14px 16px',
        borderLeft: accent ? `3px solid ${accent}` : undefined,
      }}
    >
      <span
        className="uppercase font-semibold"
        style={{ fontSize: 10.5, letterSpacing: '0.1em', color: v('text-faint') }}
      >
        {label}
      </span>
      <span
        className="proto-mono font-semibold leading-none"
        style={{ fontSize: 24, color: v('text') }}
      >
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 12, color: v('text-muted') }}>{sub}</span>
      )}
    </div>
  );
}

/* ─────────────────────── Success radial ─────────────────────── */
export function SuccessRadial({
  pct,
  size = 168,
  glow = false,
}: {
  pct: number;
  size?: number;
  glow?: boolean;
}) {
  const r = 66;
  const c = 2 * Math.PI * r;
  const D = 160;
  return (
    <svg
      viewBox={`0 0 ${D} ${D}`}
      width={size}
      height={size}
      style={glow ? { filter: 'drop-shadow(0 0 14px var(--ring))' } : undefined}
    >
      <g transform={`translate(${D / 2},${D / 2})`}>
        <circle r={r} fill="none" stroke={v('surface-3')} strokeWidth={16} />
        <circle
          r={r}
          fill="none"
          stroke={v('positive')}
          strokeWidth={16}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          transform="rotate(-90)"
        />
        <text
          textAnchor="middle"
          y={-2}
          className="proto-mono"
          fontSize={40}
          fontWeight={700}
          fill={v('text')}
        >
          {pct}%
        </text>
        <text
          textAnchor="middle"
          y={22}
          fontSize={13}
          fontWeight={600}
          fill={v('text-muted')}
          style={{ letterSpacing: '0.12em' }}
        >
          SUCCESS
        </text>
      </g>
    </svg>
  );
}

/* ─────────────────────── Stacked allocation bar ─────────────────────── */
export function AllocationBar() {
  const segs = [
    { k: 'stock', label: 'Stocks', pct: 60 },
    { k: 'bond', label: 'Bonds', pct: 30 },
    { k: 'cash', label: 'Cash', pct: 10 },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="relative flex w-full overflow-hidden"
        style={{ height: 40, borderRadius: v('radius-sm') }}
      >
        {segs.map((s, i) => (
          <div
            key={s.k}
            className="relative"
            style={{ width: `${s.pct}%`, background: v(s.k) }}
          >
            {i < segs.length - 1 && (
              <div
                className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 z-10"
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background: v('surface'),
                  border: `2px solid ${v('text')}`,
                  boxShadow: v('shadow-card'),
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        {segs.map((s) => (
          <div key={s.k} className="flex items-center gap-1.5">
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: v(s.k),
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 12, color: v('text-muted') }}>
              {s.label} <b style={{ color: v('text') }}>{s.pct}%</b>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────── Withdrawal curve editor ─────────────────────── */
export function WithdrawalCurve() {
  const W = 300;
  const H = 96;
  const pts = [
    [0, 60],
    [70, 52],
    [150, 56],
    [230, 40],
    [300, 44],
  ];
  const toY = (rate: number) => H - (rate / 70) * H;
  const path = pts
    .map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${toY(p[1])}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      {[0.25, 0.5, 0.75].map((g) => (
        <line
          key={g}
          x1={0}
          x2={W}
          y1={H * g}
          y2={H * g}
          stroke={v('border')}
          strokeWidth={1}
        />
      ))}
      <path
        d={`${path} L ${W} ${H} L 0 ${H} Z`}
        fill={v('brand-soft')}
        opacity={0.7}
      />
      <path d={path} fill="none" stroke={v('brand')} strokeWidth={2.5} />
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p[0] === 300 ? 296 : p[0] === 0 ? 4 : p[0]}
          cy={toY(p[1])}
          r={5}
          fill={v('surface')}
          stroke={v('brand')}
          strokeWidth={2.5}
        />
      ))}
    </svg>
  );
}

/* ─────────────────────── Spaghetti chart ─────────────────────── */
export function Spaghetti({ height = 280 }: { height?: number }) {
  const W = 640;
  const H = height;
  const pad = { l: 8, r: 8, t: 12, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = 30; // years
  const x = (t: number) => pad.l + (t / n) * iw;
  const y = (val: number) => pad.t + (1 - val) * ih; // val 0..1 of initial-ish

  const rand = rng(7);
  const survivors: string[] = [];
  for (let s = 0; s < 16; s++) {
    const drift = 0.3 + rand() * 1.6; // ending multiple
    let path = `M ${x(0)} ${y(0.5)}`;
    let val = 0.5;
    for (let t = 1; t <= n; t++) {
      const target = 0.5 + (drift - 0.5) * (t / n);
      val = val + (target - val) * 0.5 + (rand() - 0.5) * 0.08;
      val = Math.max(0.05, Math.min(0.98, val));
      path += ` L ${x(t)} ${y(val)}`;
    }
    survivors.push(path);
  }
  // a couple of failures that drop to zero
  const failures: string[] = [];
  for (let f = 0; f < 2; f++) {
    let val = 0.5;
    let path = `M ${x(0)} ${y(0.5)}`;
    const dieAt = 16 + Math.floor(rand() * 8);
    for (let t = 1; t <= dieAt; t++) {
      val = Math.max(0, val - 0.03 - rand() * 0.03);
      path += ` L ${x(t)} ${y(val)}`;
    }
    failures.push(path);
  }
  // median band
  const bandTop: string[] = [];
  const bandBot: string[] = [];
  for (let t = 0; t <= n; t++) {
    const mid = 0.5 + (t / n) * 0.5;
    bandTop.push(`${t ? 'L' : 'M'} ${x(t)} ${y(mid + 0.16)}`);
    bandBot.push(`${x(t)} ${y(mid - 0.16)}`);
  }
  const band = bandTop.join(' ') + ' L ' + bandBot.reverse().join(' L ') + ' Z';
  const median = `M ${x(0)} ${y(0.5)} ` +
    Array.from({ length: n }, (_, i) => `L ${x(i + 1)} ${y(0.5 + ((i + 1) / n) * 0.5)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + g * ih} y2={pad.t + g * ih}
          stroke={v('border')} strokeWidth={1} />
      ))}
      <path d={band} fill={v('brand-soft')} opacity={0.6} />
      {survivors.map((p, i) => (
        <path key={i} d={p} fill="none" stroke={v('brand')} strokeWidth={1.4} opacity={0.32} />
      ))}
      {failures.map((p, i) => (
        <path key={`f${i}`} d={p} fill="none" stroke={v('negative')} strokeWidth={1.8} opacity={0.85} />
      ))}
      <path d={median} fill="none" stroke={v('text')} strokeWidth={2.4} />
      {['1971', '1986', '2001', '2016'].map((yr, i) => (
        <text key={yr} x={pad.l + (i / 3) * iw} y={H - 6} fontSize={11} fill={v('text-faint')}
          textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}>
          {yr}
        </text>
      ))}
    </svg>
  );
}

/* ─────────────────────── Mini bar chart (start-year outcomes) ─────────────────────── */
export function OutcomeBars({ height = 280 }: { height?: number }) {
  const rand = rng(13);
  const bars = Array.from({ length: 24 }, () => 0.25 + rand() * 0.7);
  const H = height;
  return (
    <div className="flex items-end gap-1.5" style={{ height: H }}>
      {bars.map((b, i) => {
        const fail = b < 0.34;
        return (
          <div
            key={i}
            className="flex-1"
            style={{
              height: `${b * 100}%`,
              background: fail ? v('negative') : v('brand'),
              opacity: fail ? 0.9 : 0.85,
              borderRadius: '4px 4px 0 0',
            }}
          />
        );
      })}
    </div>
  );
}

/* ─────────────────────── Legend ─────────────────────── */
export function Legend() {
  const items = [
    { c: v('text'), label: 'Median trajectory' },
    { c: v('brand'), label: 'Survived' },
    { c: v('negative'), label: 'Depleted' },
    { c: v('brand-soft'), label: '25–75th band' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span style={{ width: 16, height: 4, borderRadius: 2, background: it.c, display: 'inline-block' }} />
          <span style={{ fontSize: 12, color: v('text-muted') }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────── Palette / type spec strip ─────────────────────── */
export function ThemeSpec({
  name,
  vibe,
  fonts,
  swatches,
}: {
  name: string;
  vibe: string;
  fonts: string;
  swatches: { c: string; label: string }[];
}) {
  return (
    <Card className="flex flex-col gap-4" style={{ background: v('surface-2') }}>
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <Eyebrow>Theme</Eyebrow>
          <div className="proto-display" style={{ fontSize: 26, fontWeight: 700, color: v('text') }}>
            {name}
          </div>
        </div>
        <div style={{ fontSize: 13, color: v('text-muted'), maxWidth: 420 }}>{vibe}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {swatches.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span
              style={{
                width: 28, height: 28, borderRadius: 8, background: s.c,
                border: `1px solid ${v('border-strong')}`, display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 11, color: v('text-muted') }}>{s.label}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: v('text-faint') }}>{fonts}</div>
    </Card>
  );
}

export const vv = v;
