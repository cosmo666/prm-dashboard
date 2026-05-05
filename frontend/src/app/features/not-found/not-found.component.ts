import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, interval } from 'rxjs';
import { startWith, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-not-found',
  templateUrl: './not-found.component.html',
  styleUrls: ['./not-found.component.scss'],
})
export class NotFoundComponent implements OnInit, OnDestroy {
  attemptedPath = '';
  now = '';

  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    // Show the path the user actually hit (helpful for ops debugging).
    const url = window.location.pathname + window.location.search;
    this.attemptedPath = url || '/';

    interval(1000).pipe(startWith(0), takeUntil(this.destroy$)).subscribe(() => {
      const d = new Date();
      const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
      this.now = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
