import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { ToastService, ToastMessage } from '../../../core/toast/toast.service';

@Component({
  selector: 'app-toast-container',
  templateUrl: './toast-container.component.html',
  styleUrls: ['./toast-container.component.scss'],
})
export class ToastContainerComponent {
  toasts$: Observable<ToastMessage[]>;

  constructor(public service: ToastService) {
    this.toasts$ = this.service.toasts$;
  }

  trackById(_index: number, t: ToastMessage): number { return t.id; }
}
