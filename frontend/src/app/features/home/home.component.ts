import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/core/auth/auth.service';
import { ThemeService } from 'src/app/core/theme/theme.service';
import { AuthStore } from 'src/app/core/store/auth.store';

interface Tile {
  title: string;
  description: string;
  icon: string;
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
    { title: 'PRM Dashboard', description: 'Overview, top airlines, fulfillment', icon: 'pi pi-chart-bar', route: '/dashboard' },
  ];

  constructor(
    public theme: ThemeService,
    public authStore: AuthStore,
    private auth: AuthService,
    private router: Router,
  ) {}

  go(tile: Tile): void {
    if (!tile.route) { return; }
    this.router.navigate([tile.route]);
  }

  toggleTheme(): void { this.theme.toggle(); }
  logout(): void { this.auth.logout(); }
}
