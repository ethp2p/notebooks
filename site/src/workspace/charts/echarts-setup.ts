import * as echarts from 'echarts/core';
import {
  BarChart, LineChart, ScatterChart, HeatmapChart,
  SankeyChart, BoxplotChart, CustomChart,
} from 'echarts/charts';
import {
  GridComponent, TooltipComponent, LegendComponent,
  VisualMapComponent, DataZoomComponent, MarkAreaComponent,
  MarkLineComponent, TitleComponent, AxisPointerComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { observatoryThemeLight } from './theme';

let registered = false;

export function ensureEchartsRegistered(): void {
  if (registered) return;
  echarts.use([
    CanvasRenderer,
    BarChart, LineChart, ScatterChart, HeatmapChart,
    SankeyChart, BoxplotChart, CustomChart,
    GridComponent, TooltipComponent, LegendComponent,
    VisualMapComponent, DataZoomComponent, MarkAreaComponent,
    MarkLineComponent, TitleComponent, AxisPointerComponent,
  ]);
  echarts.registerTheme('observatory-light', observatoryThemeLight());
  registered = true;
}

export { echarts };
