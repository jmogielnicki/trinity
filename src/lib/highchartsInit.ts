import Highcharts from 'highcharts';
// In Highcharts v12, modules register themselves as side-effects; no factory call needed.
import 'highcharts/highcharts-more'; // includes arearange, columnrange, etc.
import { CHART } from '../components/colors';

// Resolve chart-chrome tokens once at module load. index.css is imported before
// this module in main.tsx, so the @theme custom properties are already parsed
// on document.documentElement and getComputedStyle returns real values.
const ink = CHART.ink;
const label = CHART.label;
const muted = CHART.muted;
const grid = CHART.grid;
const hairline = CHART.hairline;
const surface = CHART.surface;

Highcharts.setOptions({
  chart: {
    backgroundColor: surface,
    style: { fontFamily: 'inherit' },
    animation: false,
    plotBorderWidth: 0,
  },
  title: { text: '' },
  subtitle: { text: '' },
  credits: { enabled: false },
  xAxis: {
    lineColor: grid,
    tickColor: grid,
    gridLineColor: 'transparent',
    labels: { style: { color: muted, fontSize: '11px' } },
    title: { style: { color: label, fontSize: '11px' } },
  },
  yAxis: {
    gridLineColor: hairline,
    lineWidth: 0,
    tickWidth: 0,
    labels: { style: { color: muted, fontSize: '11px' } },
    title: { style: { color: label, fontSize: '11px' } },
  },
  tooltip: {
    backgroundColor: surface,
    borderColor: grid,
    borderRadius: 4,
    shadow: false,
    style: { color: ink, fontSize: '11px' },
    useHTML: true,
  },
  legend: {
    enabled: false,
    itemStyle: { color: label, fontSize: '11px', fontWeight: 'normal' },
  },
  plotOptions: {
    series: { animation: false },
  },
});

export { Highcharts };
