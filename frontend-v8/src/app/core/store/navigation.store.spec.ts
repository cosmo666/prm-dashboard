import { TestBed } from '@angular/core/testing';
import { NavigationStore } from './navigation.store';

describe('NavigationStore', () => {
  let store: NavigationStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [NavigationStore] });
    store = TestBed.get(NavigationStore);
  });

  it('starts with empty active title', () => {
    expect(store.activeTitleSnapshot).toBe('');
  });

  it('setActiveTitle updates the snapshot', () => {
    store.setActiveTitle('Overview');
    expect(store.activeTitleSnapshot).toBe('Overview');
  });

  it('activeTitle$ emits the current value to subscribers', () => {
    const captured: string[] = [];
    store.activeTitle$.subscribe(v => captured.push(v));
    store.setActiveTitle('Top 10');
    store.setActiveTitle('Overview');
    expect(captured).toEqual(['', 'Top 10', 'Overview']);
  });
});
