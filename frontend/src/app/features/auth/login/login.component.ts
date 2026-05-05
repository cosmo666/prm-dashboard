import { Component, AfterViewInit, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, fromEvent } from 'rxjs';
import { takeUntil, throttleTime } from 'rxjs/operators';
import { AuthService } from 'src/app/core/auth/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements AfterViewInit, OnDestroy {
  form: FormGroup;
  errorMessage: string | null = null;
  loading = false;

  @ViewChild('parallaxPanel', { static: false }) parallaxPanel?: ElementRef<HTMLElement>;
  private destroy$ = new Subject<void>();

  constructor(
    fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
  ) {
    this.form = fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });
  }

  // Helpers used by template (avoid optional chaining — TS 3.4 incompatible).
  emailHasError(): boolean {
    const c = this.form.get('email');
    return c !== null && c.touched && c.invalid;
  }

  passwordHasError(): boolean {
    const c = this.form.get('password');
    return c !== null && c.touched && c.invalid;
  }

  ngAfterViewInit(): void {
    if (!this.parallaxPanel) { return; }
    fromEvent<MouseEvent>(this.parallaxPanel.nativeElement, 'mousemove').pipe(
      throttleTime(16),
      takeUntil(this.destroy$),
    ).subscribe(ev => this.applyParallax(ev));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  submit(): void {
    if (this.form.invalid) { return; }
    this.loading = true;
    this.errorMessage = null;
    const email = this.form.value.email;
    const password = this.form.value.password;
    this.auth.login(email, password).subscribe(
      () => {
        this.loading = false;
        this.router.navigate(['/home']);
      },
      err => {
        this.loading = false;
        this.errorMessage = err && err.status === 401
          ? 'Invalid email or password'
          : 'Login failed — please try again';
      },
    );
  }

  private applyParallax(ev: MouseEvent): void {
    if (!this.parallaxPanel) { return; }
    const panel = this.parallaxPanel.nativeElement;
    const rect = panel.getBoundingClientRect();
    const cx = (ev.clientX - rect.left) / rect.width;
    const cy = (ev.clientY - rect.top) / rect.height;
    const shape1 = panel.querySelector('.parallax-shape-1') as HTMLElement | null;
    const shape2 = panel.querySelector('.parallax-shape-2') as HTMLElement | null;
    if (shape1) { shape1.style.transform = 'translate(' + (cx * -20) + 'px, ' + (cy * -20) + 'px)'; }
    if (shape2) { shape2.style.transform = 'translate(' + (cx * 30) + 'px, ' + (cy * 30) + 'px)'; }
  }
}
