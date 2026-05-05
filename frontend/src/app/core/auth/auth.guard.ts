import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthStore } from '../store/auth.store';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(private store: AuthStore, private router: Router) {}

  canActivate(): boolean {
    if (this.store.isAuthenticatedSnapshot) {
      return true;
    }
    this.router.navigate(['/login']);
    return false;
  }
}
