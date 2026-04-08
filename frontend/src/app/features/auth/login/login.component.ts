import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/auth/auth.service';
import { TenantStore } from '../../../core/store/tenant.store';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatInputModule, MatFormFieldModule, MatCheckboxModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  tenant = inject(TenantStore);

  username = signal('');
  password = signal('');
  rememberMe = signal(false);
  loading = signal(false);
  error = signal<string | null>(null);

  async onSubmit() {
    if (!this.username() || !this.password()) {
      this.error.set('Username and password are required');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      await new Promise<void>((resolve, reject) => {
        this.auth.login(this.username(), this.password(), this.tenant.slug()).subscribe({
          next: () => resolve(),
          error: (e) => reject(e),
        });
      });
      this.router.navigate(['/home']);
    } catch (e: any) {
      this.error.set(e?.error?.message ?? 'Login failed — check credentials');
    } finally {
      this.loading.set(false);
    }
  }
}
