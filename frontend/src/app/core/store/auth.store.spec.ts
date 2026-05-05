import { AuthStore, Employee } from './auth.store';

describe('AuthStore', () => {
  let store: AuthStore;

  const sampleEmployee: Employee = {
    id: 1,
    displayName: 'Alice',
    email: 'alice@example.com',
    airports: [
      { code: 'DEL', name: 'Indira Gandhi International Airport' },
      { code: 'BOM', name: 'Chhatrapati Shivaji International Airport' },
    ],
  };

  beforeEach(() => { store = new AuthStore(); });

  it('starts with null token, null employee', () => {
    expect(store.accessTokenSnapshot).toBeNull();
    expect(store.employeeSnapshot).toBeNull();
    expect(store.airportCodesSnapshot).toEqual([]);
  });

  it('setAccessToken updates snapshot and stream', (done) => {
    store.accessToken$.subscribe(token => {
      if (token === 'jwt-abc') {
        expect(store.accessTokenSnapshot).toBe('jwt-abc');
        done();
      }
    });
    store.setAccessToken('jwt-abc');
  });

  it('setEmployee exposes airports through derived snapshot', () => {
    store.setEmployee(sampleEmployee);
    expect(store.employeeSnapshot).toEqual(sampleEmployee);
    expect(store.airportCodesSnapshot).toEqual(['DEL', 'BOM']);
  });

  it('clear resets all fields', () => {
    store.setAccessToken('jwt-abc');
    store.setEmployee(sampleEmployee);
    store.clear();
    expect(store.accessTokenSnapshot).toBeNull();
    expect(store.employeeSnapshot).toBeNull();
    expect(store.airportCodesSnapshot).toEqual([]);
  });

  it('isAuthenticatedSnapshot is true only when both token and employee present', () => {
    expect(store.isAuthenticatedSnapshot).toBe(false);
    store.setAccessToken('jwt-abc');
    expect(store.isAuthenticatedSnapshot).toBe(false);
    store.setEmployee(sampleEmployee);
    expect(store.isAuthenticatedSnapshot).toBe(true);
    store.clear();
    expect(store.isAuthenticatedSnapshot).toBe(false);
  });
});
