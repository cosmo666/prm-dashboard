import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { catchError, finalize, map, of, switchMap } from 'rxjs';
import { AuthStore } from '../store/auth.store';
import { AuthService } from './auth.service';
import { ProgressService } from '../progress/progress.service';

export const authGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const authService = inject(AuthService);
  const progress = inject(ProgressService);
  const router = inject(Router);

  if (authStore.isAuthenticated()) {
    return true;
  }

  // Silent session restore via refresh cookie before giving up.
  // Surface a thin top progress bar while the refresh + /me round-trip is in flight.
  progress.start();
  return authService.refresh().pipe(
    switchMap(() => authService.ensureProfile()),
    map(() => true),
    catchError(() => {
      router.navigate(['/login']);
      return of(false);
    }),
    finalize(() => progress.stop()),
  );
};
