/**
 * Static methodology / about page. Plain content — no store wiring.
 * Kept in sync by hand with the engine; if the methodology changes,
 * update the relevant section here.
 */
export function AboutPanel() {
  return (
		<div className="max-w-[720px] text-base leading-[1.6] text-text-body [&_h2]:font-display [&_h2]:text-xl [&_h2]:mt-1 [&_h2]:mb-3 [&_h2]:text-text [&_h3]:font-display [&_h3]:text-lg [&_h3]:mt-[22px] [&_h3]:mb-1.5 [&_h3]:text-primary [&_p]:my-2 [&_ul]:my-2 [&_ul]:pl-5 [&_li]:my-[5px] [&_code]:bg-surface-code [&_code]:px-1 [&_code]:py-px [&_code]:rounded-xs [&_code]:text-sm">
			<h2>About this simulator</h2>
			<p>
				This tool stress-tests retirement withdrawal strategies against{" "}
				<strong>actual historical market sequences</strong> rather than
				averages or Monte-Carlo draws. A plan is replayed starting
				in every year on record, played forward year-by-year using the
				real returns that actually occurred. The output is a fan of
				trajectories — one per start year — that exposes{" "}
				<em>sequence-of-returns risk</em>: the fact that a bad first
				decade is far more dangerous than the same bad decade later on.
			</p>

			<h3>Everything is in real (today&apos;s) dollars</h3>
			<p>
				This is the single most important thing to understand when
				reading the charts and tables. The engine works entirely in{" "}
				<strong>constant purchasing power</strong>. Balances, returns,
				and withdrawals are all real — inflation has already been
				divided out.
			</p>
			<p>
				That is why a classic &ldquo;4% rule&rdquo; withdrawal shows as
				a flat <code>$40k</code> every year in the detail view, not a
				number that climbs. In nominal dollars the retiree&apos;s cheque{" "}
				<em>does</em> grow with inflation each year — but the whole
				point of that growth is to hold purchasing power constant, and
				once you denominate in today&apos;s dollars, &ldquo;constant
				purchasing power&rdquo; simply <em>is</em> a flat $40k. The
				inflation adjustment isn&apos;t missing; it is baked into the
				units. A withdrawal that visibly grew in this view would mean
				the retiree was actually spending more each year.
			</p>

			<h3>Data sources</h3>
			<ul>
				<li>
					<strong>Stocks &amp; bonds:</strong> Robert Shiller&apos;s
					online dataset (monthly, 1871–present). We use his published{" "}
					<em>cumulative total-return indices</em> — the stock index
					includes reinvested dividends; the bond index is a
					constant-maturity 10-year Treasury total return (coupon
					income plus price change from yield movements, not yield
					used as a proxy). Both are already on a real, CPI-adjusted
					basis; annual real returns are the ratio of successive
					December index values. Nominal returns are reconstructed
					from the period CPI change.
				</li>
				<li>
					<strong>Cash:</strong> FRED 3-month T-bill rate (TB3MS),
					monthly factors compounded across each calendar year,
					deflated by CPI. Cash data only exists from 1934 onward;
					earlier years carry no cash series, and a cash sleeve before
					1934 is folded into bonds rather than treated as a phantom
					0%-real holding.
				</li>
			</ul>
			<p>
				Coverage in the bundled dataset: <strong>1872–2025</strong> for
				stocks and bonds, <strong>1934–2025</strong> for cash. Realized
				long-run real returns are about 7.1%/yr for stocks and 2.4%/yr
				for bonds. The data build fails loudly if these land outside
				sane bands — a guard against a source-column mix-up silently
				shifting every return by inflation.
			</p>

			<h3>How a simulation runs</h3>
			<p>
				Each year, in order: the withdrawal is taken at the start of the
				year; if the portfolio is exhausted, the run is recorded as a
				failure at that year; otherwise that calendar year&apos;s real
				returns are applied to each asset sleeve. A run{" "}
				<strong>succeeds</strong> if the portfolio survives the full
				horizon with a positive balance.
			</p>

			<h3>Recent retirees &amp; partial data</h3>
			<p>
				A long horizon means recent start years don&apos;t have a full
				run of historical data yet — the 2008 retiree on a 50-year
				horizon is only ~17 years in. We handle this by truncating.
				In-progress runs stop where the data ends. They still contribute
				to the percentile envelopes for the years they cover, but are
				excluded from success-rate denominators — we genuinely
				don&apos;t know yet whether they succeed.
			</p>
			<p>
				Anything drawn from observed history renders solid; anything
				sampled renders translucent or hatched. You should never have to
				guess which numbers are facts and which are projections.
			</p>

			<h3>Scope &amp; limitations</h3>
			<ul>
				<li>
					<strong>Pre-tax.</strong> All figures ignore taxes. Real
					after-tax outcomes are worse.
				</li>
				<li>
					<strong>US-only.</strong> The Shiller series is the longest
					clean record available; international data is out of scope
					for now.
				</li>
				<li>
					<strong>No Social Security or pensions.</strong> The
					portfolio is the only income source modeled.
				</li>
				<li>
					<strong>Fixed horizon.</strong> A fixed N-year retirement,
					not a variable life expectancy.
				</li>
				<li>
					<strong>Past is not future.</strong> Historical sequences
					are a far more honest stress test than a single average —
					but they are still a finite sample of one country&apos;s
					history, not a guarantee.
				</li>
			</ul>
		</div>
  );
}
