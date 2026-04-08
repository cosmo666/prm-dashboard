import { Component, inject, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { AirportSelectorComponent } from '../airport-selector/airport-selector.component';
import { DevTenantPickerComponent } from '../dev-tenant-picker/dev-tenant-picker.component';
import { TooltipDirective } from '../../directives/tooltip.directive';
import { TenantStore } from '../../../core/store/tenant.store';
import { AuthStore } from '../../../core/store/auth.store';
import { AuthService } from '../../../core/auth/auth.service';
import { NavigationStore } from '../../../core/store/navigation.store';
import { ThemeService } from '../../../core/theme/theme.service';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [CommonModule, RouterLink, MatMenuModule, AirportSelectorComponent, DevTenantPickerComponent, TooltipDirective],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
})
export class TopBarComponent {
  showBack = input<boolean>(false);
  tenant = inject(TenantStore);
  auth = inject(AuthStore);
  theme = inject(ThemeService);
  nav = inject(NavigationStore);
  private authSvc = inject(AuthService);

  tenantInitial = computed(() => (this.tenant.name() || this.tenant.slug() || 'P').charAt(0).toUpperCase());
  userInitials = computed(() => {
    const name = this.auth.employee()?.name || '';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  });

  logout(): void { this.authSvc.logout(); }
  toggleTheme(): void { this.theme.toggle(); }
}
