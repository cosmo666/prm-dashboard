import { Component, DebugElement } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TooltipDirective } from './tooltip.directive';

@Component({
  template: `<button [appTooltip]="text" tooltipPosition="bottom">click</button>`,
})
class HostComponent {
  text = 'hello';
}

describe('TooltipDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let buttonEl: DebugElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [HostComponent, TooltipDirective],
    });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    buttonEl = fixture.debugElement.query(By.css('button'));
  });

  it('is created on the host element', () => {
    const directive = buttonEl.injector.get(TooltipDirective);
    expect(directive).toBeTruthy();
  });

  it('reads the text and position inputs', () => {
    const directive = buttonEl.injector.get(TooltipDirective);
    expect(directive.text).toBe('hello');
    expect(directive.tooltipPosition).toBe('bottom');
  });
});
