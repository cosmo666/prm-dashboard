import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { AirportSelectorComponent } from '../airport-selector/airport-selector.component';
import { TenantStore } from '../../../core/store/tenant.store';
import { AuthStore } from '../../../core/store/auth.store';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [CommonModule, RouterLink, MatToolbarModule, MatButtonModule, MatMenuModule, MatIconModule, AirportSelectorComponent],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
})
export class TopBarComponent {
  showBack = input<boolean>(false);
  tenant = inject(TenantStore);
  auth = inject(AuthStore);
  private authSvc = inject(AuthService);

  logout() { this.authSvc.logout(); }
}
