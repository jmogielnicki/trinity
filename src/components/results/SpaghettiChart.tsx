import { useEffect, useMemo, useRef, useCallback } from 'react';
import HighchartsReact from 'highcharts-react-official';
import type { Options, SeriesLineOptions } from 'highcharts';
import { Highcharts } from '../../lib/highchartsInit';
import type { ScenarioResult, SimulationResult } from '../../engine/types';
import { CURRENT_COLOR, SNAPSHOT_COLOR } from '../../store/compareStore';

type Props = {
  result: ScenarioResult;
  /** Optional second result drawn on the same axes for A/B comparison. */
  overlay?: ScenarioResult | null;
  height?: number;
  /** When non-empty, only sims whose startYear is in this set render at full
   * intensity; the rest fade out so highlighted runs pop. */
  selectedYears?: Set<number>;
  /** Click on a line toggles its start year in the selection. */
  onToggle?: (year: number, e: { shiftKey: boolean }) => void;
  /** Marquee handler: receives the years whose trajectories enter the rect. */
  onMarquee?: (years: number[], e: { shiftKey: boolean }) => void;
  /** Called when the user clicks empty chart space — use to clear selection. */
  onClear?: () => void;
};

function simColor(sim: SimulationResult, baseColor: string): string {
  if (!sim.success && !sim.inProgress) return '#d33';
  if (sim.inProgress) return '#888';
  return baseColor;
}

function simBaseOpacity(sim: SimulationResult): number {
  if (!sim.success && !sim.inProgress) return 0.75;
  if (sim.inProgress) return 0.55;
  return 0.4;
}

function buildSeriesForSim(
  sim: SimulationResult,
  source: 'current' | 'snapshot',
  baseColor: string,
  hasSelection: boolean,
  selectedYears: Set<number> | undefined,
): SeriesLineOptions {
  const color = simColor(sim, baseColor);
  const baseOpacity = simBaseOpacity(sim);
  const isSelected = selectedYears?.has(sim.startYear) ?? false;
  const opacity = hasSelection ? (isSelected ? 1 : 0.04) : baseOpacity;
  const lineWidth = hasSelection && isSelected ? 2 : 1;

  // Bootstrap sims: use zones to render prefix solid and tail dashed.
  const useZones = sim.bootstrapped && sim.prefixYears < sim.trajectory.length;

  const data = sim.trajectory.map((r) => [r.t, r.balance] as [number, number]);

  const series: SeriesLineOptions = {
    type: 'line',
    data,
    color,
    opacity,
    lineWidth,
    marker: { enabled: false },
    enableMouseTracking: true,
    custom: { sim, source },
    turboThreshold: 0,
  } as SeriesLineOptions;

  if (useZones) {
    // Prefix zone: solid (default). Tail zone: dashed + half opacity via
    // dashStyle. We approximate the reduced tail opacity via a lighter color
    // since Highcharts zones don't support per-zone opacity directly.
    (series as any).zoneAxis = 'x';
    (series as any).zones = [
      {
        value: sim.prefixYears - 1,
        // prefix: solid, full opacity
      },
      {
        // tail: dashed
        dashStyle: 'Dash',
        color: color + '80', // half-transparent via hex alpha
      },
    ];
  }

  return series;
}

export function SpaghettiChart({
  result,
  overlay = null,
  height = 460,
  selectedYears,
  onToggle,
  onMarquee,
  onClear,
}: Props) {
  const chartRef = useRef<HighchartsReact.RefObject>(null);
  const hasSelection = !!selectedYears && selectedYears.size > 0;

  // Stable refs so event handlers always see the latest callbacks/data
  // without needing to be in useMemo deps (which would rebuild all series).
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const onMarqueeRef = useRef(onMarquee);
  onMarqueeRef.current = onMarquee;
  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;
  const resultRef = useRef(result);
  resultRef.current = result;
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const selectedYearsRef = useRef(selectedYears);
  selectedYearsRef.current = selectedYears;
  const hasSelectionRef = useRef(hasSelection);
  hasSelectionRef.current = hasSelection;

  const horizon = useMemo(() => {
    const a = result.sims.reduce((m, s) => Math.max(m, s.trajectory.length), 0);
    const b = overlay
      ? overlay.sims.reduce((m, s) => Math.max(m, s.trajectory.length), 0)
      : 0;
    return Math.max(a, b);
  }, [result.sims, overlay]);

  const maxBalance = useMemo(() => {
    let m = 0;
    const scan = (sims: SimulationResult[]) => {
      for (const s of sims)
        for (const r of s.trajectory) if (r.balance > m) m = r.balance;
    };
    scan(result.sims);
    if (overlay) scan(overlay.sims);
    return m || 1;
  }, [result.sims, overlay]);

  const seriesData = useMemo(() => {
    const series: SeriesLineOptions[] = [];
    for (const sim of result.sims) {
      series.push(buildSeriesForSim(sim, 'current', CURRENT_COLOR, hasSelection, selectedYears));
    }
    if (overlay) {
      for (const sim of overlay.sims) {
        series.push(buildSeriesForSim(sim, 'snapshot', SNAPSHOT_COLOR, hasSelection, selectedYears));
      }
    }
    return series;
  }, [result.sims, overlay, hasSelection, selectedYears]);

  // Update series opacity/lineWidth imperatively on selection change
  // to avoid full chart rebuild.
  useEffect(() => {
    const chart = chartRef.current?.chart;
    if (!chart) return;

    for (const series of chart.series) {
      const custom = (series.options as any).custom;
      if (!custom?.sim) continue;
      const sim: SimulationResult = custom.sim;
      const baseOpacity = simBaseOpacity(sim);
      const isSelected = selectedYears?.has(sim.startYear) ?? false;
      const opacity = hasSelection ? (isSelected ? 1 : 0.04) : baseOpacity;
      const lineWidth = hasSelection && isSelected ? 2 : 1;
      series.update({ opacity, lineWidth } as any, false);
    }
    chart.redraw(false);
  }, [selectedYears, hasSelection]);

  const fmt = (n: number) =>
    n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${Math.round(n)}`;

  // Stable selection handler — reads latest data/callbacks via refs.
  const selectionHandler = useCallback(function (this: unknown, e: any) {
    e.preventDefault();
    const cb = onMarqueeRef.current;
    if (!cb || !e.xAxis || !e.yAxis) return false;

    const xMin = e.xAxis[0].min as number;
    const xMax = e.xAxis[0].max as number;
    const yMin = e.yAxis[0].min as number;
    const yMax = e.yAxis[0].max as number;

    const within = new Set<number>();
    const scan = (sims: SimulationResult[]) => {
      for (const s of sims) {
        for (const r of s.trajectory) {
          if (r.t >= xMin && r.t <= xMax && r.balance >= yMin && r.balance <= yMax) {
            within.add(s.startYear);
            break;
          }
        }
      }
    };
    scan(resultRef.current.sims);
    if (overlayRef.current) scan(overlayRef.current.sims);
    cb([...within], { shiftKey: !!(e.originalEvent as MouseEvent)?.shiftKey });
    return false;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clickHandler = useCallback(function (this: unknown, e: any) {
    if (!e.point && !e.series) onClearRef.current?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seriesClickHandler = useCallback(function (this: unknown, e: any) {
    const sim: SimulationResult | undefined = (this as any).options?.custom?.sim;
    if (sim) onToggleRef.current?.(sim.startYear, { shiftKey: !!(e.browserEvent as MouseEvent)?.shiftKey });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seriesMouseOverHandler = useCallback(function (this: unknown) {
    if (hasSelectionRef.current) return;
    const chart = (this as any).chart;
    if (!chart) return;
    const hoveredSim: SimulationResult | undefined = (this as any).options?.custom?.sim;
    for (const s of chart.series) {
      const custom = (s.options as any).custom;
      if (!custom?.sim) continue;
      const isSelf = custom.sim === hoveredSim;
      const baseOpacity = simBaseOpacity(custom.sim);
      s.group?.attr({ opacity: isSelf ? baseOpacity : 0.06 });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seriesMouseOutHandler = useCallback(function (this: unknown) {
    if (hasSelectionRef.current) return;
    const chart = (this as any).chart;
    if (!chart) return;
    for (const s of chart.series) {
      const custom = (s.options as any).custom;
      if (!custom?.sim) continue;
      s.group?.attr({ opacity: simBaseOpacity(custom.sim) });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const options: Options = useMemo(
    () => ({
      chart: {
        width: null as any,
        height,
        margin: [16, 16, 36, 86],
        zooming: { type: 'xy' } as any,
        events: {
          click: clickHandler,
          selection: selectionHandler,
        },
      },
      xAxis: {
        min: 0,
        max: Math.max(1, horizon - 1),
        title: { text: 'years into retirement' },
        tickInterval: Math.ceil((horizon - 1) / 8) || 1,
      },
      yAxis: {
        min: 0,
        max: maxBalance,
        title: { text: 'balance (real $)' },
        labels: {
          formatter() {
            const v = this.value as number;
            return `$${(v / 1e6).toFixed(1)}M`;
          },
        },
      },
      tooltip: {
        formatter() {
          const series = this.series as any;
          const custom = series?.options?.custom;
          if (!custom?.sim) return false;
          const sim: SimulationResult = custom.sim;
          if (hasSelectionRef.current && !(selectedYearsRef.current?.has(sim.startYear))) return false;
          const last = sim.trajectory[sim.trajectory.length - 1];
          const status = !sim.success && !sim.inProgress
            ? 'depleted'
            : sim.inProgress
              ? 'in-progress'
              : 'survived';
          const line2 = sim.depletedAt != null
            ? `depleted at year ${sim.depletedAt}`
            : `final ${fmt(last?.balance ?? 0)} (year ${last?.t ?? 0})`;
          return `<span style="font-size:11px"><b>start ${sim.startYear}</b> — ${status}<br>${line2}</span>`;
        },
      },
      plotOptions: {
        series: {
          cursor: 'pointer',
          // Only track mouse when cursor is actually over a line; hides tooltip
          // and clears hover state when cursor moves to empty chart space.
          stickyTracking: false,
          events: {
            click: seriesClickHandler,
            mouseOver: seriesMouseOverHandler,
            mouseOut: seriesMouseOutHandler,
          },
          states: {
            hover: { lineWidthPlus: 0 },
            // Disable Highcharts' automatic inactive-state management so it
            // never overrides our imperatively-set opacity values.
            inactive: { enabled: false },
          },
        },
      },
      series: seriesData,
    }),
    [height, horizon, maxBalance, seriesData, clickHandler, selectionHandler, seriesClickHandler, seriesMouseOverHandler, seriesMouseOutHandler],
  );

  // Marquee: shift+mousedown on the chart container starts a native drag
  // that is handled by Highcharts' built-in selection event. We just need to
  // ensure the container passes shift+drag to the chart's zooming mechanism.
  // Highcharts handles this natively with zooming.type:'xy' and the selection event.

  return (
    <div className="block w-full">
      <HighchartsReact
        highcharts={Highcharts}
        options={options}
        ref={chartRef}
        immutable={false}
      />
    </div>
  );
}
