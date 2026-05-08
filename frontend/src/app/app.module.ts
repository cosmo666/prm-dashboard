import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { NgxEchartsModule } from 'ngx-echarts';

import { AppRoutingModule } from './app-routing.module';
import { CoreModule } from './core/core.module';
import { AppComponent } from './app.component';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';
import { ProgressBarComponent } from './shared/components/progress-bar/progress-bar.component';
import { CommandPaletteComponent } from './shared/components/command-palette/command-palette.component';

// Exported (not inline arrow) so the AOT compiler can statically reference
// it from the @NgModule decorator metadata. Function expressions are
// rejected by Angular 8's template compiler in decorator config.
export function loadEcharts() {
  return import('echarts');
}

@NgModule({
  // Global shell components live in AppModule (not SharedModule) —
  // they're singletons mounted once in AppComponent and never re-used
  // by feature modules.
  declarations: [
    AppComponent,
    ToastContainerComponent,
    ProgressBarComponent,
    CommandPaletteComponent,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    // FormsModule is here (not just in SharedModule) so the
    // CommandPaletteComponent — declared at AppModule scope — can
    // bind [(ngModel)] on its search input. Angular 8 silently fails
    // ngModel binding without it (the input value never updates).
    FormsModule,
    CoreModule,
    // NgxEchartsModule.forRoot lives at the AppModule level so the echarts
    // factory provider sits in the root injector. Lazy-loaded feature modules
    // that import SharedModule then resolve the same NgxEchartsModule
    // instance from root rather than instantiating their own.
    NgxEchartsModule.forRoot({ echarts: loadEcharts }),
    AppRoutingModule,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
