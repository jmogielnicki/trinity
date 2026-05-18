import Highcharts from 'highcharts';
// In Highcharts v12, modules register themselves as side-effects; no factory call needed.
import 'highcharts/highcharts-more'; // includes arearange, columnrange, etc.

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
