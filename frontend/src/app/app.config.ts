import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideEchartsCore } from 'ngx-echarts';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, SankeyChart, HeatmapChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent, DatasetComponent, VisualMapComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';

echarts.use([BarChart, LineChart, PieChart, SankeyChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, DatasetComponent, VisualMapComponent, DataZoomComponent, CanvasRenderer]);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    // NoopAnimations — not BrowserAnimations — because nginx CSP blocks `eval`
    // and `new Function()`, which @angular/animations uses internally for
    // trigger compilation. Using the noop player keeps mat-menu / mat-select /
    // cdk-overlay functional (they fall back to static positioning with no
    // transition). Custom CSS animations elsewhere in the app are unaffected.
    provideNoopAnimations(),
    provideEchartsCore({ echarts }),
  ],
};
