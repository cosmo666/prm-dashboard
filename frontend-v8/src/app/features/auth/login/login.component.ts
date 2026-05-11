import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { takeUntil, startWith } from 'rxjs/operators';
import { AuthService } from 'src/app/core/auth/auth.service';
import { TenantStore } from 'src/app/core/store/tenant.store';

// Seed demo credentials. The login page is pre-auth so the JWT-protected
// /tenants/airports + /auth/me endpoints aren't reachable; the data here
// mirrors data/master/employees.csv + employee_airports.csv exactly so
// reviewers can pick an account and see its scope without leaving the
// page. Password is `admin123` for every seeded user (POC convention).
interface DemoUser {
  username: string;
  airports: string[];
}
interface DemoTenantInfo {
  airports: string[]; // unique airport codes any user in this tenant can access
  users: DemoUser[];
}
const DEMO_PASSWORD = 'admin123';
const DEMO_TENANTS: { [slug: string]: DemoTenantInfo } = {
  aeroground: {
    airports: ['BLR', 'HYD', 'DEL'],
    users: [
      { username: 'admin', airports: ['BLR', 'HYD', 'DEL'] },
      { username: 'john',  airports: ['BLR', 'HYD'] },
      { username: 'priya', airports: ['BLR'] },
      { username: 'ravi',  airports: ['DEL'] },
    ],
  },
  skyserve: {
    airports: ['BLR', 'BOM', 'MAA'],
    users: [
      { username: 'admin',  airports: ['BLR', 'BOM', 'MAA'] },
      { username: 'anika',  airports: ['BLR', 'BOM'] },
      { username: 'deepak', airports: ['MAA'] },
      { username: 'sunita', airports: ['BOM'] },
    ],
  },
  globalprm: {
    airports: ['SYD', 'KUL', 'JFK'],
    users: [
      { username: 'admin', airports: ['SYD', 'KUL', 'JFK'] },
      { username: 'sarah', airports: ['SYD', 'KUL'] },
      { username: 'mike',  airports: ['JFK'] },
      { username: 'li',    airports: ['KUL'] },
    ],
  },
};

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit, OnDestroy {
  form: FormGroup;
  errorMessage: string | null = null;
  loading = false;
  now = '';
  demoPassword = DEMO_PASSWORD;
  demoTenant: DemoTenantInfo | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    fb: FormBuilder,
    public tenantStore: TenantStore,
    private auth: AuthService,
    private router: Router,
  ) {
    this.form = fb.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required]],
    });
  }

  usernameHasError(): boolean {
    const c = this.form.get('username');
    return c !== null && c.touched && c.invalid;
  }

  passwordHasError(): boolean {
    const c = this.form.get('password');
    return c !== null && c.touched && c.invalid;
  }

  ngOnInit(): void {
    // Live-updating monospace clock in the footer — small "operations" detail.
    interval(1000).pipe(startWith(0), takeUntil(this.destroy$)).subscribe(() => {
      this.now = this.formatTime(new Date());
    });

    // Resolve the demo tenant info from the slug already loaded by
    // TenantResolver. Falls back to null if the subdomain doesn't map
    // to a seeded tenant (the credential helper just hides itself).
    this.tenantStore.tenant$.pipe(takeUntil(this.destroy$)).subscribe(t => {
      this.demoTenant = t && DEMO_TENANTS[t.slug] ? DEMO_TENANTS[t.slug] : null;
    });
  }

  /**
   * Click-to-prefill: tap a demo user row to drop their creds into the form.
   * patchValue() updates the FormControl but doesn't fire native DOM input
   * events, so <app-form-field>'s floated-label state would stay stuck on
   * "empty". Re-fire `input` on each underlying control so the label rises.
   */
  prefill(username: string): void {
    this.form.patchValue({ username, password: DEMO_PASSWORD });
    setTimeout(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('.login-form input');
      inputs.forEach(el => el.dispatchEvent(new Event('input', { bubbles: true })));
    }, 0);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  submit(): void {
    if (this.form.invalid) { return; }
    this.loading = true;
    this.errorMessage = null;
    const username = this.form.value.username;
    const password = this.form.value.password;
    this.auth.login(username, password).subscribe(
      () => {
        this.loading = false;
        this.router.navigate(['/home']);
      },
      err => {
        this.loading = false;
        this.errorMessage = err && err.status === 401
          ? 'Invalid credentials'
          : 'Sign-in failed. Please try again.';
      },
    );
  }

  private formatTime(d: Date): string {
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' UTC' + this.tzOffset(d);
  }

  private tzOffset(d: Date): string {
    const offsetMin = -d.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    const h = Math.floor(abs / 60);
    return sign + (h < 10 ? '0' + h : '' + h);
  }
}
