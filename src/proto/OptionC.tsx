/* OPTION C — "Sunrise"
   Warm, friendly, approachable. Rounded geometry, cream background, coral brand
   with indigo + sage accents, big soft type and roomy touch targets. Vibe: a
   calm consumer app that makes a scary topic feel manageable. */
import './proto.css';
import {
  AllocationBar, Button, Card, Eyebrow, Legend, OutcomeBars, Pill, Segmented,
  Spaghetti, StatCard, SuccessRadial, ThemeSpec, WithdrawalCurve, vv as v,
} from './mock';
import { ProtoSwitcher } from './ProtoSwitcher';

function Header() {
  return (
    <header className="mx-auto max-w-[1180px] px-5 sm:px-8 pt-6">
      <div
        className="flex items-center gap-4 px-4 sm:px-5 py-3"
        style={{ background: v('surface'), borderRadius: v('radius-lg'), boxShadow: v('shadow-card'), border: `1px solid ${v('border')}` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex items-center justify-center font-bold"
            style={{ width: 40, height: 40, borderRadius: 14, background: v('brand'), color: v('brand-ink'), fontSize: 20 }}
          >
            ☀
          </div>
          <div className="proto-display leading-none" style={{ fontSize: 21, fontWeight: 700, color: v('text') }}>
            Retirement calculator
          </div>
        </div>
        <div className="ml-auto hidden md:flex items-center gap-2.5">
          <Pill label="Portfolio" value="$1.00M" />
          <Pill label="Horizon" value="30 yr" />
        </div>
        <Button>Save</Button>
        <div
          className="flex items-center justify-center font-semibold"
          style={{ width: 40, height: 40, borderRadius: 999, background: v('accent-soft'), color: v('accent'), fontSize: 14 }}
        >
          JM
        </div>
      </div>
    </header>
  );
}

function Tabs() {
  const tabs = ['Build', 'Compare', 'Optimize'];
  return (
    <div className="flex gap-2">
      {tabs.map((t, i) => (
        <div
          key={t}
          className="px-5 py-2.5 cursor-pointer font-semibold"
          style={
            i === 0
              ? { background: v('brand'), color: v('brand-ink'), borderRadius: v('radius-pill'), fontSize: 14.5, boxShadow: v('shadow-card') }
              : { background: v('surface'), color: v('text-muted'), borderRadius: v('radius-pill'), fontSize: 14.5, border: `1px solid ${v('border')}` }
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
    <Card className="flex flex-col gap-6 self-start" style={{ borderRadius: v('radius-lg') }}>
      <div>
        <Eyebrow>Your plan</Eyebrow>
        <div className="proto-display" style={{ fontSize: 23, fontWeight: 700, marginTop: 2 }}>Shape it 🪄</div>
      </div>
      <Segmented options={['Classic', 'Glide', 'Income', 'Custom']} active={0} />
      <div className="flex flex-col gap-3">
        <h3 className="proto-display" style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>How it's invested</h3>
        <AllocationBar />
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="proto-display" style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>How much you spend</h3>
        <WithdrawalCurve />
        <div className="flex items-center justify-between" style={{ fontSize: 13, color: v('text-muted') }}>
          <span>4.0% to start</span>
          <span className="proto-mono" style={{ color: v('text') }}>$40,000/yr</span>
        </div>
      </div>
      <Button variant="soft" className="justify-center w-full">Save to library</Button>
    </Card>
  );
}

export function OptionC() {
  return (
    <div className="proto-root theme-sunrise">
      <Header />
      <main className="mx-auto max-w-[1180px] px-5 sm:px-8 py-6 flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs />
        </div>

        <ThemeSpec
          name="Sunrise"
          vibe="Warm and reassuring. Rounded cards, cream paper, coral + indigo + sage, friendly rounded headings — makes a daunting topic feel calm and human."
          fonts="Display: Quicksand / Avenir rounded  ·  Body: Avenir / system  ·  Numerals: monospace, tabular"
          swatches={[
            { c: v('brand'), label: 'Coral' },
            { c: v('accent'), label: 'Indigo' },
            { c: v('cash'), label: 'Sage' },
            { c: v('positive'), label: 'Survived' },
            { c: v('bg'), label: 'Cream' },
          ]}
        />

        {/* Big friendly hero banner */}
        <Card
          className="proto-rise flex flex-col sm:flex-row items-center gap-7"
          style={{ borderRadius: v('radius-lg'), background: `linear-gradient(135deg, ${v('surface')} 60%, ${v('brand-soft')})` }}
        >
          <SuccessRadial pct={95} />
          <div className="flex-1">
            <div className="proto-display" style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15 }}>
              Your plan survived <span style={{ color: v('positive') }}>91 of 96</span> historical retirements.
            </div>
            <p style={{ fontSize: 14.5, color: v('text-muted'), marginTop: 8, marginBottom: 0 }}>
              The five that ran short all started in the brutal 1965–1969 stretch. Here's how every start year played out.
            </p>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Sidebar />

          <div className="flex flex-col gap-6 min-w-0">
            <div className="grid grid-cols-2 min-[760px]:grid-cols-4 gap-3">
              <StatCard label="Median final" value="$1.66M" accent={v('accent')} />
              <StatCard label="5th-pct final" value="$0.21M" accent={v('brand')} />
              <StatCard label="Avg spend" value="$41.2k" accent={v('cash')} />
              <StatCard label="Worst start" value="1966" accent={v('negative')} />
            </div>

            <Card className="flex flex-col gap-4" style={{ borderRadius: v('radius-lg') }}>
              <h3 className="proto-display" style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Portfolio balance over time</h3>
              <Spaghetti height={250} />
              <Legend />
            </Card>

            <Card className="flex flex-col gap-4" style={{ borderRadius: v('radius-lg') }}>
              <h3 className="proto-display" style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Outcome by start year</h3>
              <OutcomeBars height={180} />
            </Card>
          </div>
        </div>
      </main>
      <div className="h-20" />
      <ProtoSwitcher current="/optionc" />
    </div>
  );
}
