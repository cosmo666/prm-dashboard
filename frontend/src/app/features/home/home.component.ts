import { Component, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TopBarComponent } from '../../shared/components/top-bar/top-bar.component';
import { AuthStore } from '../../core/store/auth.store';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, TopBarComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  private authSvc = inject(AuthService);
  auth = inject(AuthStore);

  firstName = computed(() => {
    const name = this.auth.employee()?.name || '';
    return name.split(/\s+/)[0] || 'operator';
  });

  airportCount = computed(() => this.auth.employee()?.airports?.length ?? 0);
  airportCodes = computed(() => (this.auth.employee()?.airports ?? []).map((a) => a.code));

  ngOnInit(): void {
    if (!this.auth.employee()) {
      this.authSvc.ensureProfile().subscribe();
    }
  }
}
