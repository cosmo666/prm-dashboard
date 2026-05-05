import { NgModule, Optional, SkipSelf } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthInterceptor } from './auth/auth.interceptor';

@NgModule({
  imports: [CommonModule],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
  ],
})
export class CoreModule {
  constructor(@Optional() @SkipSelf() parent?: CoreModule) {
    if (parent) {
      throw new Error('CoreModule is already loaded. Import it only in AppModule.');
    }
  }
}
