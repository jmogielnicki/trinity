import Highcharts from 'highcharts';
import HighchartsHeatmap from 'highcharts/modules/heatmap';
import HighchartsBoost from 'highcharts/modules/boost';

// Load modules once — cast required because Highcharts ESM types don't expose callable signatures
(HighchartsHeatmap as unknown as (hc: typeof Highcharts) => void)(Highcharts);
(HighchartsBoost as unknown as (hc: typeof Highcharts) => void)(Highcharts);

Highcharts.setOptions({
  chart: {
    backgroundColor: '#fff',
    style: { fontFamily: 'inherit' },
    animation: false,
    plotBorderWidth: 0,
  },
  title: { text: '' },
  subtitle: { text: '' },
  credits: { enabled: false },
  xAxis: {
    lineColor: '#ccc',
    tickColor: '#ccc',
    gridLineColor: 'transparent',
    labels: { style: { color: '#666', fontSize: '11px' } },
    title: { style: { color: '#444', fontSize: '11px' } },
  },
  yAxis: {
    gridLineColor: '#eee',
    lineWidth: 0,
    tickWidth: 0,
    labels: { style: { color: '#666', fontSize: '11px' } },
    title: { style: { color: '#444', fontSize: '11px' } },
  },
  tooltip: {
    backgroundColor: '#fff',
    borderColor: '#bbb',
    borderRadius: 4,
    shadow: false,
    style: { color: '#222', fontSize: '11px' },
    useHTML: true,
  },
  legend: {
    enabled: false,
    itemStyle: { color: '#444', fontSize: '11px', fontWeight: 'normal' },
  },
  plotOptions: {
    series: { animation: false },
  },
});

export { Highcharts };
