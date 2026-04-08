import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { tenantResolver } from './core/auth/tenant.resolver';

export const routes: Routes = [
  {
    path: 'login',
    resolve: { tenant: tenantResolver },
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'home',
    canActivate: [authGuard],
    resolve: { tenant: tenantResolver },
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    resolve: { tenant: tenantResolver },
    loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: '**', redirectTo: 'home' },
];
