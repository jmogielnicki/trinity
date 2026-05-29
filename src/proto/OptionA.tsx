/* OPTION A — "Evergreen"
   Premium, editorial light theme. Serif display type, forest-green brand with a
   gold accent, warm paper background, generous whitespace, soft tall cards.
   Vibe: a private-bank research tool that respects your eyes. */
import './proto.css';
import {
  AllocationBar, Button, Card, Eyebrow, Legend, OutcomeBars, Pill, Segmented,
  Spaghetti, StatCard, SuccessRadial, ThemeSpec, WithdrawalCurve, vv as v,
} from './mock';
import { ProtoSwitcher } from './ProtoSwitcher';

function Header() {
  return (
    <header
      className="sticky top-0 z-40"
      style={{ background: 'rgba(244,241,233,0.85)', backdropFilter: 'blur(10px)', borderBottom: `1px solid ${v('border')}` }}
    >
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-4 flex items-center gap-5">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex items-center justify-center font-bold"
            style={{ width: 38, height: 38, borderRadius: 12, background: v('brand'), color: v('brand-ink'), fontSize: 18 }}
          >
            ↟
          </div>
          <div className="min-w-0">
            <div className="proto-display leading-none" style={{ fontSize: 22, fontWeight: 700, color: v('text') }}>
              Retirement calculator
            </div>
            <div style={{ fontSize: 12.5, color: v('text-muted') }} className="hidden sm:block">
              Stress-test every start year, 1871–2025
            </div>
          </div>
        </div>
        <div className="ml-auto hidden lg:flex items-center gap-2.5">
          <Pill label="Portfolio" value="$1.00M" />
          <Pill label="Horizon" value="30 yr" />
        </div>
        <Button>Save strategy</Button>
        <div
          className="flex items-center justify-center font-semibold"
          style={{ width: 38, height: 38, borderRadius: 999, background: v('accent-soft'), color: v('accent'), fontSize: 14 }}
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
    <div className="flex gap-6 border-b" style={{ borderColor: v('border') }}>
      {tabs.map((t, i) => (
        <div
          key={t}
          className="pb-3 cursor-pointer font-semibold"
          style={
            i === 0
              ? { color: v('brand'), borderBottom: `2.5px solid ${v('brand')}`, marginBottom: -1, fontSize: 15 }
              : { color: v('text-muted'), fontSize: 15 }
          }
        >
          {t}
        </div>
      ))}
    </div>
  );
}

function Sidebar() {
  return (
    <Card className="flex flex-col gap-6 self-start">
      <div>
        <Eyebrow>Strategy</Eyebrow>
        <div className="proto-display" style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>Build your plan</div>
      </div>
      <Segmented options={['Classic', 'Glide', 'Income', 'Custom']} active={0} />
      <div className="flex flex-col gap-3">
        <h3 className="proto-display" style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Allocation</h3>
        <AllocationBar />
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="proto-display" style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Withdrawal rate</h3>
        <WithdrawalCurve />
        <div className="flex items-center justify-between" style={{ fontSize: 12.5, color: v('text-muted') }}>
          <span>4.0% of initial</span>
          <span className="proto-mono" style={{ color: v('text') }}>$40,000/yr</span>
        </div>
      </div>
      <Button variant="soft" className="justify-center w-full">Save to library</Button>
    </Card>
  );
}

export function OptionA() {
  return (
    <div className="proto-root theme-evergreen">
      <Header />
      <main className="mx-auto max-w-[1240px] px-5 sm:px-8 py-7 flex flex-col gap-6">
        <Tabs />

        <ThemeSpec
          name="Evergreen"
          vibe="Premium editorial. Serif headlines, forest + gold, warm paper, lots of air — a research tool that feels considered, not clerical."
          fonts="Display: Iowan / Palatino serif  ·  Body: system sans  ·  Numerals: monospace, tabular"
          swatches={[
            { c: v('brand'), label: 'Forest' },
            { c: v('accent'), label: 'Gold' },
            { c: v('positive'), label: 'Survived' },
            { c: v('negative'), label: 'Depleted' },
            { c: v('bg'), label: 'Paper' },
          ]}
        />

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Sidebar />

          <div className="flex flex-col gap-6 min-w-0">
            {/* Hero */}
            <Card className="proto-rise flex flex-col sm:flex-row items-center gap-7">
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <SuccessRadial pct={95} />
                <div style={{ fontSize: 13, color: v('text-muted') }}>across 96 start years</div>
              </div>
              <div className="grid grid-cols-2 gap-3 flex-1 w-full">
                <StatCard label="Median final" value="$1.66M" sub="real, today's $" accent={v('brand')} />
                <StatCard label="5th-pct final" value="$0.21M" sub="worst survivors" accent={v('accent')} />
                <StatCard label="Avg withdrawal" value="$41.2k" sub="per year" accent={v('cash')} />
                <StatCard label="Worst start" value="1966" sub="failed at yr 25" accent={v('negative')} />
              </div>
            </Card>

            {/* Charts */}
            <Card className="flex flex-col gap-5">
              <div className="grid gap-6 min-[900px]:grid-cols-2">
                <div className="flex flex-col gap-2 min-w-0">
                  <h3 className="proto-display" style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Portfolio balance over time</h3>
                  <Spaghetti height={260} />
                </div>
                <div className="flex flex-col gap-2 min-w-0">
                  <h3 className="proto-display" style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Outcome by start year</h3>
                  <OutcomeBars height={260} />
                </div>
              </div>
              <div className="pt-1 border-t" style={{ borderColor: v('border') }}>
                <Legend />
              </div>
            </Card>
          </div>
        </div>
      </main>
      <div className="h-20" />
      <ProtoSwitcher current="/optiona" />
    </div>
  );
}
