import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { ProgressService } from '../../../core/progress/progress.service';

@Component({
  selector: 'app-progress-bar',
  templateUrl: './progress-bar.component.html',
  styleUrls: ['./progress-bar.component.scss'],
})
export class ProgressBarComponent {
  active$: Observable<boolean>;

  constructor(private progress: ProgressService) {
    this.active$ = this.progress.active$;
  }
}
