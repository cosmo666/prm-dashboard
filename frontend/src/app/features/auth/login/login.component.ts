import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { TenantStore } from '../../../core/store/tenant.store';
import { DevTenantPickerComponent } from '../../../shared/components/dev-tenant-picker/dev-tenant-picker.component';
import { credentialsFor, stationsFor } from './demo-credentials';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, DevTenantPickerComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  tenant = inject(TenantStore);

  username = signal('');
  password = signal('');
  showPassword = signal(false);
  loading = signal(false);
  error = signal<string | null>(null);

  tenantInitial = computed(() => (this.tenant.name() || this.tenant.slug() || 'P').charAt(0).toUpperCase());
  demoUsers = computed(() => credentialsFor(this.tenant.slug()));
  demoStations = computed(() => stationsFor(this.tenant.slug()));
  currentTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

  // Mouse parallax — shift the background grid by a small amount based on cursor position
  parallaxX = signal(0);
  parallaxY = signal(0);

  @HostListener('mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // -1 .. 1 range, then scale by 14px max travel
    const x = (e.clientX / w - 0.5) * 2;
    const y = (e.clientY / h - 0.5) * 2;
    this.parallaxX.set(x * 14);
    this.parallaxY.set(y * 14);
  }

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  async onSubmit(): Promise<void> {
    if (!this.username() || !this.password()) {
      this.error.set('Username and password are required');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.auth.login(this.username(), this.password(), this.tenant.slug()));
      this.router.navigate(['/home']);
    } catch (e: any) {
      this.error.set(e?.error?.message ?? 'Invalid credentials — try again');
    } finally {
      this.loading.set(false);
    }
  }
}
