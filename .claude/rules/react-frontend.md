# React/TypeScript Frontend Conventions

## Stack
- React 19 + TypeScript + Vite 8 + Tailwind CSS 4
- React Router 7 for routing
- TanStack React Query for server state management
- Lucide React for icons
- clsx for conditional class names

## Project Structure
- `src/pages/` — Page-level components (one per route)
- `src/components/` — Shared layout components (AppShell, Sidebar, TopBar)
- `src/hooks/` — Custom hooks (useApi.ts for API utilities)
- `src/api/client.ts` — Centralized API client (base URL, error handling)
- `src/assets/` — Static assets

## Component Organization
- One component per file, PascalCase filenames
- Max 300 lines per file — extract sub-components if larger
- camelCase for utilities and hooks

## State Management
- TanStack React Query for all server state — no manual fetch + useState
- Lift component state only as high as needed
- Use React context for cross-cutting concerns (auth, theme, notifications)

## Styling
- Tailwind CSS 4 utility classes — no CSS modules or styled-components
- Mobile-first responsive design
- No inline styles except for truly dynamic values
- Use clsx for conditional class composition

## API Integration
- All API calls go through `src/api/client.ts`
- Use React Query hooks for data fetching, mutations, and cache invalidation
- Loading and error states for all async operations

## RBAC
- Role-based UI: employee sees own schedule, manager sees team, admin sees all
- Route guards for protected pages
- Hide UI elements the user can't interact with (don't just disable)

## Linting & Build
- ESLint with React hooks and React Refresh plugins
- TypeScript strict mode — `tsc -b && vite build`
- `npm run dev` for dev server, `npm run build` for production
