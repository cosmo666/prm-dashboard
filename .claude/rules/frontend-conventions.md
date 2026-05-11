# Frontend Conventions — see the per-stack rule

PRM Dashboard ships **two parallel frontends** on `main` against one backend. Pick the rule file by directory:

- `frontend/**` (Angular 17 + Material 3 + NgRx Signal Store, host port 4200) → **[`angular-frontend.md`](./angular-frontend.md)**
- `frontend-v8/**` (Angular 8 + PrimeNG + BehaviorSubject, host port 4300) → **[`angular-v8-frontend.md`](./angular-v8-frontend.md)**

This stub exists only so legacy references don't 404.
