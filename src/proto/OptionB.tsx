/* OPTION B — "Midnight"
   Dark, data-forward dashboard. Geometric display type, neon teal brand with a
   periwinkle accent, glassy cards on a near-black field, glowing focal metric,
   tabular monospace numerals everywhere. Vibe: a modern trading terminal. */
import './proto.css';
import {
  AllocationBar, Button, Card, Eyebrow, Legend, OutcomeBars, Pill, Segmented,
  Spaghetti, SuccessRadial, WithdrawalCurve, vv as v,
} from './mock';
import { ProtoSwitcher } from './ProtoSwitcher';

function Header() {
  return (
    <header
      className="sticky top-0 z-40"
      style={{ background: 'rgba(10,14,24,0.8)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${v('border')}` }}
    >
      <div className="mx-auto max-w-[1280px] px-5 sm:px-8 py-3.5 flex items-center gap-5">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex items-center justify-center proto-display font-bold"
            style={{ width: 36, height: 36, borderRadius: 10, background: v('brand'), color: v('brand-ink'), fontSize: 18, boxShadow: 'var(--glow)' }}
          >
            ⌁
          </div>
          <div className="proto-display leading-none" style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em', color: v('text') }}>
            Retirement&nbsp;calculator
          </div>
        </div>
        <div className="ml-auto hidden lg:flex items-center gap-2.5">
          <Pill label="Portfolio" value="$1.00M" />
          <Pill label="Horizon" value="30 yr" />
        </div>
        <Button>Save strategy</Button>
        <div
          className="flex items-center justify-center font-semibold"
          style={{ width: 36, height: 36, borderRadius: 999, background: v('surface-2'), color: v('brand'), border: `1px solid ${v('border-strong')}`, fontSize: 13 }}
        >
          JM
        </div>
      </div>
    </header>
  );
}

function Tabs() {
  const tabs = ['Build strategy', 'Compare strategies', 'Optimize strategies'];
  return (
    <div className="inline-flex p-1 rounded-full" style={{ background: v('surface'), border: `1px solid ${v('border')}` }}>
      {tabs.map((t, i) => (
        <div
          key={t}
          className="px-4 py-2 rounded-full cursor-pointer font-semibold"
          style={
            i === 0
              ? { background: v('brand'), color: v('brand-ink'), fontSize: 13.5 }
              : { color: v('text-muted'), fontSize: 13.5 }
          }
        >
          {t}
        </div>
      ))}
    </div>
  );
}

function KpiStrip() {
  const kpis = [
    { label: 'Success rate', value: '95%', accent: v('positive') },
    { label: 'Median final', value: '$1.66M', accent: v('stock') },
    { label: 'Avg withdrawal', value: '$41.2k', accent: v('bond') },
    { label: 'Worst start', value: '1966', accent: v('negative') },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {kpis.map((k) => (
        <Card key={k.label} pad={false} className="px-5 py-4" style={{ background: v('surface') }}>
          <div className="flex items-center gap-2 mb-2">
            <span style={{ width: 8, height: 8, borderRadius: 999, background: k.accent, display: 'inline-block', boxShadow: `0 0 10px ${k.accent}` }} />
            <span className="uppercase font-semibold" style={{ fontSize: 10.5, letterSpacing: '0.12em', color: v('text-faint') }}>{k.label}</span>
          </div>
          <div className="proto-mono font-semibold" style={{ fontSize: 28, color: v('text') }}>{k.value}</div>
        </Card>
      ))}
    </div>
  );
}

function Sidebar() {
  return (
    <Card className="flex flex-col gap-6 self-start">
      <div className="flex items-center justify-between">
        <Eyebrow>Strategy</Eyebrow>
        <span style={{ fontSize: 11, color: v('brand') }} className="proto-mono">● live</span>
      </div>
      <Segmented options={['Classic', 'Glide', 'Income', 'Custom']} active={0} />
      <div className="flex flex-col gap-3">
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: v('text-muted'), letterSpacing: '0.04em' }} className="uppercase">Allocation</h3>
        <AllocationBar />
      </div>
      <div className="flex flex-col gap-3">
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: v('text-muted'), letterSpacing: '0.04em' }} className="uppercase">Withdrawal rate</h3>
        <WithdrawalCurve />
        <div className="flex items-center justify-between proto-mono" style={{ fontSize: 12.5, color: v('text-muted') }}>
          <span>4.0% initial</span>
          <span style={{ color: v('brand') }}>$40,000/yr</span>
        </div>
      </div>
      <Button variant="soft" className="justify-center w-full">Save to library</Button>
    </Card>
  );
}

function ThemeSpecInline() {
  return (
    <div className="hidden md:flex items-center gap-3">
      {[
        { c: v('brand'), label: 'Teal' },
        { c: v('accent'), label: 'Periwinkle' },
        { c: v('bond'), label: 'Amber' },
        { c: v('negative'), label: 'Depleted' },
      ].map((s) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span style={{ width: 14, height: 14, borderRadius: 5, background: s.c, display: 'inline-block', boxShadow: `0 0 10px ${s.c}` }} />
          <span style={{ fontSize: 11, color: v('text-faint') }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

export function OptionB() {
  return (
    <div
      className="proto-root theme-midnight"
      style={{
        backgroundImage:
          'radial-gradient(1200px 480px at 80% -10%, rgba(46,230,195,0.10), transparent 60%), radial-gradient(900px 420px at 0% 0%, rgba(138,160,255,0.10), transparent 55%)',
      }}
    >
      <Header />
      <main className="mx-auto max-w-[1280px] px-5 sm:px-8 py-7 flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Tabs />
          <ThemeSpecInline />
        </div>

        <KpiStrip />

        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Sidebar />

          <div className="flex flex-col gap-6 min-w-0">
            <div className="grid gap-6 min-[900px]:grid-cols-[260px_minmax(0,1fr)]">
              {/* Glowing focal metric */}
              <Card className="proto-rise flex flex-col items-center justify-center gap-2">
                <SuccessRadial pct={95} glow />
                <div style={{ fontSize: 12.5, color: v('text-muted') }} className="proto-mono">96 start years · 1871–1995</div>
              </Card>
              {/* Spaghetti */}
              <Card className="flex flex-col gap-3 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="proto-display" style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Portfolio balance over time</h3>
                  <span className="proto-mono" style={{ fontSize: 12, color: v('text-faint') }}>real $</span>
                </div>
                <Spaghetti height={236} />
                <Legend />
              </Card>
            </div>

            <Card className="flex flex-col gap-3">
              <h3 className="proto-display" style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Outcome by start year</h3>
              <OutcomeBars height={200} />
            </Card>
          </div>
        </div>
      </main>
      <div className="h-20" />
      <ProtoSwitcher current="/optionb" />
    </div>
  );
}
