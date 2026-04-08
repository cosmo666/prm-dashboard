import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/theme/theme.service';
import { ProgressBarComponent } from './shared/components/progress-bar/progress-bar.component';
import { CommandPaletteComponent } from './shared/components/command-palette/command-palette.component';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ProgressBarComponent, CommandPaletteComponent, ToastContainerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  // Eagerly instantiate the theme service so it applies the saved theme
  // to <html> before the first route renders.
  private readonly themeService = inject(ThemeService);
}
