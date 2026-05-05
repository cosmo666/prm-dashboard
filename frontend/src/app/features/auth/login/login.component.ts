import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { takeUntil, startWith } from 'rxjs/operators';
import { AuthService } from 'src/app/core/auth/auth.service';
import { TenantStore } from 'src/app/core/store/tenant.store';

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
