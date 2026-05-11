import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/core/auth/auth.service';
import { ThemeService } from 'src/app/core/theme/theme.service';
import { AuthStore } from 'src/app/core/store/auth.store';
import { TenantStore } from 'src/app/core/store/tenant.store';

interface Tile {
  title: string;
  description: string;
  icon: string;
  meta: string;
  // null = "tab not yet ported" placeholder
  route: string | null;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent {
  tiles: Tile[] = [
    {
      title: 'PRM Dashboard',
      description: 'Overview, top airlines, fulfillment metrics.',
      icon: 'pi pi-chart-bar',
      meta: '5 tabs · live data',
      route: '/dashboard',
    },
  ];

  constructor(
    public theme: ThemeService,
    public authStore: AuthStore,
    public tenantStore: TenantStore,
    private auth: AuthService,
    private router: Router,
  ) {}

  go(tile: Tile): void {
    if (!tile.route) { return; }
    this.router.navigate([tile.route]);
  }

  toggleTheme(): void { this.theme.toggle(); }
  logout(): void { this.auth.logout(); }

  initials(name: string): string {
    if (!name) { return '·'; }
    const parts = name.trim().split(/\s+/);
    const first = parts[0] ? parts[0].charAt(0) : '';
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  }
}
