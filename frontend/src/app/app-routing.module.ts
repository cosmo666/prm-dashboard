import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { environment } from 'src/environments/environment';
import { AuthGuard } from './core/auth/auth.guard';
import { TenantResolver } from './core/auth/tenant.resolver';

const baseRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  {
    path: 'login',
    loadChildren: () => import('./features/auth/auth.module').then(m => m.AuthModule),
    resolve: { tenant: TenantResolver },
  },
  {
    path: 'home',
    canActivate: [AuthGuard],
    loadChildren: () => import('./features/home/home.module').then(m => m.HomeModule),
  },
];

// _smoke route is gated on environment.smoke so production builds never register it.
// In dev (environment.ts) smoke=true → route present; in prod (environment.prod.ts)
// smoke=false → array is empty, route never reaches the router config.
const smokeRoute: Routes = environment.smoke
  ? [
      {
        path: '_smoke',
        loadChildren: () =>
          import('./features/primeng-smoke/primeng-smoke.module').then(m => m.PrimengSmokeModule),
      },
    ]
  : [];

const fallbackRoutes: Routes = [
  {
    path: '**',
    loadChildren: () => import('./features/not-found/not-found.module').then(m => m.NotFoundModule),
  },
];

const routes: Routes = [...baseRoutes, ...smokeRoute, ...fallbackRoutes];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
