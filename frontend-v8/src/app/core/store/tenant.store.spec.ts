import { TenantStore, Tenant } from './tenant.store';

describe('TenantStore', () => {
  let store: TenantStore;
  const sample: Tenant = {
    slug: 'acme',
    name: 'Acme Air',
    logoUrl: 'https://example.com/logo.png',
    primaryColor: '#1976d2',
  };

  beforeEach(() => { store = new TenantStore(); });

  it('starts null', () => {
    expect(store.tenantSnapshot).toBeNull();
    expect(store.slugSnapshot).toBeNull();
  });

  it('setTenant updates snapshot, slugSnapshot derives from it', () => {
    store.setTenant(sample);
    expect(store.tenantSnapshot).toEqual(sample);
    expect(store.slugSnapshot).toBe('acme');
  });

  it('clear resets', () => {
    store.setTenant(sample);
    store.clear();
    expect(store.tenantSnapshot).toBeNull();
    expect(store.slugSnapshot).toBeNull();
  });
});
