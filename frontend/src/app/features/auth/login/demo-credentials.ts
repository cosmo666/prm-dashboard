/**
 * Demo credentials shown on the login page, keyed by tenant slug.
 * Mirrors database/init/04-seed-employees.sql — update together if the
 * seed users change. Password is `admin123` for every seed user.
 */

export interface DemoUser {
  username: string;
  password: string;
  access: string;
}

export const DEMO_CREDENTIALS: Readonly<Record<string, readonly DemoUser[]>> = {
  aeroground: [
    { username: 'admin', password: 'admin123', access: 'All airports (BLR, HYD, DEL)' },
    { username: 'john',  password: 'admin123', access: 'BLR + HYD' },
    { username: 'priya', password: 'admin123', access: 'BLR only' },
    { username: 'ravi',  password: 'admin123', access: 'DEL only' },
  ],
  skyserve: [
    { username: 'admin',  password: 'admin123', access: 'All airports (BLR, BOM, MAA)' },
    { username: 'anika',  password: 'admin123', access: 'BLR + BOM' },
    { username: 'deepak', password: 'admin123', access: 'MAA only' },
    { username: 'sunita', password: 'admin123', access: 'BOM only' },
  ],
  globalprm: [
    { username: 'admin', password: 'admin123', access: 'All airports (SYD, KUL, JFK)' },
    { username: 'sarah', password: 'admin123', access: 'SYD + KUL' },
    { username: 'mike',  password: 'admin123', access: 'JFK only' },
    { username: 'li',    password: 'admin123', access: 'KUL only' },
  ],
};

export function credentialsFor(slug: string | null | undefined): readonly DemoUser[] {
  if (!slug) return DEMO_CREDENTIALS['aeroground'];
  return DEMO_CREDENTIALS[slug] ?? DEMO_CREDENTIALS['aeroground'];
}
