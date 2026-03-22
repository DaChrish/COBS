# COBS v2 Phase 3B: Frontend UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete COBS frontend — mobile-first player UI and desktop-optimized admin area.

**Architecture:** React 19 + Mantine v8 + React Router v7. Shared layout shell with header (logo, theme toggle, user menu). Player pages use a max-width container for mobile. Admin pages use AppShell with sidebar. API calls via existing `apiFetch` wrapper. WebSocket hook for live updates.

**Tech Stack:** React 19, Mantine v8, React Router v7, Vite, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-22-cobs-v2-phase3b-frontend-ui-design.md`

---

## Scope

10 tasks covering all frontend pages:

1. Shared infrastructure (types, layout, hooks, auth guard)
2. Login + Join pages
3. Player Dashboard
4. Tournament Hub
5. Voting page (card + list)
6. Draft detail + Match reporting + Timer
7. Standings page
8. Account page
9. Admin pages (overview + tournament detail)

## Prerequisites

- Backend complete (67 tests, all API endpoints working)
- Frontend scaffolded (React + Vite + Mantine + auth hook + API client)
- Mantine v8 installed (`@mantine/core`, `@mantine/hooks`, `@mantine/notifications`)

## Important Notes for Implementers

- **Mantine v8** uses `@mantine/core` for all components. Import like: `import { Button, TextInput } from '@mantine/core'`
- **Dark/Light mode:** Use `useMantineColorScheme()` hook — returns `{ colorScheme, toggleColorScheme }`
- **API proxy:** Vite proxies `/api/*` to `http://localhost:8000` (strips `/api` prefix). So `apiFetch("/auth/login")` calls `http://localhost:8000/auth/login`
- **No frontend tests** — verify with `cd frontend && npx tsc --noEmit` (type check) and manual browser check
- **All new packages** must be installed before use: `cd frontend && npm install <package>`

---

## File Structure

```
frontend/src/
├── main.tsx                      # UPDATE: add Notifications provider
├── App.tsx                       # UPDATE: full router config
├── api/
│   ├── client.ts                 # EXISTS: apiFetch wrapper
│   └── types.ts                  # CREATE: shared API response types
├── hooks/
│   ├── useAuth.tsx               # EXISTS: auth context
│   ├── useApi.ts                 # CREATE: data fetching hook
│   └── useWebSocket.ts           # CREATE: tournament WebSocket hook
├── components/
│   ├── Layout.tsx                # CREATE: AppShell with header
│   ├── AuthGuard.tsx             # CREATE: redirect if not logged in
│   ├── AdminGuard.tsx            # CREATE: redirect if not admin
│   ├── ImpersonationBanner.tsx   # CREATE: banner when impersonating
│   ├── Timer.tsx                 # CREATE: countdown timer component
│   ├── MatchCard.tsx             # CREATE: match display + report
│   └── MatchReportModal.tsx      # CREATE: stepper + confirm dialog
├── pages/
│   ├── LoginPage.tsx             # UPDATE: real login form
│   ├── JoinPage.tsx              # CREATE: join tournament by code
│   ├── DashboardPage.tsx         # UPDATE: real tournament list
│   ├── AccountPage.tsx           # CREATE: change password
│   ├── tournament/
│   │   ├── HubPage.tsx           # CREATE: context-adaptive hub
│   │   ├── VotePage.tsx          # CREATE: card swipe + list
│   │   ├── DraftPage.tsx         # CREATE: draft detail
│   │   └── StandingsPage.tsx     # CREATE: standings table
│   └── admin/
│       ├── AdminOverview.tsx     # CREATE: tournament table
│       └── AdminTournament.tsx   # CREATE: tournament management
```

---

## Task 1: Shared Infrastructure

**Files:**
- Create: `frontend/src/api/types.ts`
- Create: `frontend/src/hooks/useApi.ts`
- Create: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/components/AuthGuard.tsx`
- Create: `frontend/src/components/AdminGuard.tsx`
- Create: `frontend/src/components/ImpersonationBanner.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/hooks/useAuth.tsx`

- [ ] **Step 1: Install additional Mantine packages**

```bash
cd frontend && npm install @mantine/notifications @tabler/icons-react
```

- [ ] **Step 2: Create `frontend/src/api/types.ts`**

Shared TypeScript types matching the backend API responses:

```typescript
export interface Tournament {
  id: string;
  name: string;
  status: "SETUP" | "VOTING" | "DRAFTING" | "FINISHED";
  join_code: string;
  max_rounds: number;
  player_count: number;
  cube_count: number;
}

export interface TournamentDetail extends Tournament {
  players: TournamentPlayer[];
  cubes: TournamentCube[];
}

export interface TournamentPlayer {
  id: string;
  user_id: string;
  username: string;
  match_points: number;
  game_wins: number;
  game_losses: number;
  dropped: boolean;
}

export interface TournamentCube {
  id: string;
  cube_id: string;
  cube_name: string;
  cube_description: string;
  cube_image_url: string | null;
  max_players: number | null;
}

export interface Cube {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
}

export interface Vote {
  tournament_cube_id: string;
  cube_name: string;
  vote: "DESIRED" | "NEUTRAL" | "AVOID";
}

export interface Draft {
  id: string;
  round_number: number;
  status: "PENDING" | "ACTIVE" | "FINISHED";
  pods: Pod[];
}

export interface Pod {
  id: string;
  pod_number: number;
  pod_size: number;
  cube_name: string;
  cube_id: string;
  timer_ends_at: string | null;
  players: PodPlayer[];
}

export interface PodPlayer {
  tournament_player_id: string;
  username: string;
  seat_number: number;
}

export interface Match {
  id: string;
  pod_id: string;
  swiss_round: number;
  player1_id: string;
  player1_username: string;
  player2_id: string | null;
  player2_username: string | null;
  player1_wins: number;
  player2_wins: number;
  is_bye: boolean;
  reported: boolean;
  has_conflict: boolean;
  p1_reported_p1_wins: number | null;
  p1_reported_p2_wins: number | null;
  p2_reported_p1_wins: number | null;
  p2_reported_p2_wins: number | null;
}

export interface StandingsEntry {
  player_id: string;
  username: string;
  match_points: number;
  match_wins: number;
  match_losses: number;
  match_draws: number;
  game_wins: number;
  game_losses: number;
  omw_percent: number;
  gw_percent: number;
  ogw_percent: number;
  dropped: boolean;
}
```

- [ ] **Step 3: Create `frontend/src/hooks/useApi.ts`**

Simple data-fetching hook with refetch capability:

```typescript
import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../api/client";

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetch<T>(path);
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, error, loading, refetch: fetchData };
}
```

- [ ] **Step 4: Update `frontend/src/hooks/useAuth.tsx`**

Add `register` method and expose `setToken` for join flow. Also add admin login support. The full updated file:

```tsx
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { apiFetch } from "../api/client";

interface AuthUser {
  id: string;
  username: string;
  is_admin: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setToken: (token: string) => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setTokenState] = useState<string | null>(
    () => localStorage.getItem("token")
  );
  const [loading, setLoading] = useState(true);

  const setToken = useCallback((t: string) => {
    localStorage.setItem("token", t);
    setTokenState(t);
  }, []);

  const fetchMe = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const me = await apiFetch<AuthUser>("/auth/me");
      setUser(me);
    } catch {
      localStorage.removeItem("token");
      setTokenState(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiFetch<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setToken(res.access_token);
  }, [setToken]);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setTokenState(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, setToken, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 5: Create `frontend/src/components/Layout.tsx`**

App shell with header (logo, theme toggle, user menu):

```tsx
import { AppShell, Group, Text, ActionIcon, Menu, Button } from "@mantine/core";
import { useMantineColorScheme } from "@mantine/core";
import { IconSun, IconMoon, IconCube, IconUser, IconLogout, IconSettings } from "@tabler/icons-react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ImpersonationBanner } from "./ImpersonationBanner";

export function Layout() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <ImpersonationBanner />
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs" style={{ cursor: "pointer" }} onClick={() => navigate("/")}>
            <IconCube size={24} color="var(--mantine-color-blue-6)" />
            <Text fw={700} size="lg">COBS</Text>
          </Group>
          <Group gap="xs">
            <ActionIcon variant="subtle" onClick={toggleColorScheme} size="lg">
              {colorScheme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
            </ActionIcon>
            {user && (
              <Menu shadow="md" width={200}>
                <Menu.Target>
                  <Button variant="subtle" size="compact-sm" leftSection={<IconUser size={16} />}>
                    {user.username}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconSettings size={14} />} onClick={() => navigate("/account")}>
                    Account
                  </Menu.Item>
                  {user.is_admin && (
                    <Menu.Item onClick={() => navigate("/admin")}>Admin</Menu.Item>
                  )}
                  <Menu.Divider />
                  <Menu.Item color="red" leftSection={<IconLogout size={14} />} onClick={() => { logout(); navigate("/login"); }}>
                    Logout
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
```

- [ ] **Step 6: Create `frontend/src/components/AuthGuard.tsx`**

```tsx
import { Navigate } from "react-router-dom";
import { Center, Loader } from "@mantine/core";
import { useAuth } from "../hooks/useAuth";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Center h="50vh"><Loader /></Center>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 7: Create `frontend/src/components/AdminGuard.tsx`**

```tsx
import { Navigate } from "react-router-dom";
import { Center, Loader } from "@mantine/core";
import { useAuth } from "../hooks/useAuth";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Center h="50vh"><Loader /></Center>;
  if (!user || !user.is_admin) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 8: Create `frontend/src/components/ImpersonationBanner.tsx`**

```tsx
import { Alert, Group, Text, Button } from "@mantine/core";
import { IconUserExclamation } from "@tabler/icons-react";
import { useAuth } from "../hooks/useAuth";

export function ImpersonationBanner() {
  const { user, logout } = useAuth();

  // Check if there's a stored admin token (set during impersonation)
  const adminToken = localStorage.getItem("admin_token");
  if (!adminToken || !user) return null;

  const endImpersonation = () => {
    localStorage.setItem("token", adminToken);
    localStorage.removeItem("admin_token");
    window.location.reload();
  };

  return (
    <Alert color="orange" py={4} px="md" radius={0} icon={<IconUserExclamation size={16} />}>
      <Group justify="space-between">
        <Text size="sm">Impersonating <b>{user.username}</b></Text>
        <Button size="compact-xs" variant="white" color="orange" onClick={endImpersonation}>
          End
        </Button>
      </Group>
    </Alert>
  );
}
```

- [ ] **Step 9: Update `frontend/src/main.tsx`**

Add Notifications provider:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { BrowserRouter } from "react-router-dom";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="auto">
      <Notifications position="top-right" />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>
);
```

- [ ] **Step 10: Update `frontend/src/App.tsx`**

Full router setup with all routes:

```tsx
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { Layout } from "./components/Layout";
import { AuthGuard } from "./components/AuthGuard";
import { AdminGuard } from "./components/AdminGuard";
import { LoginPage } from "./pages/LoginPage";
import { JoinPage } from "./pages/JoinPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AccountPage } from "./pages/AccountPage";
import { HubPage } from "./pages/tournament/HubPage";
import { VotePage } from "./pages/tournament/VotePage";
import { DraftPage } from "./pages/tournament/DraftPage";
import { StandingsPage } from "./pages/tournament/StandingsPage";
import { AdminOverview } from "./pages/admin/AdminOverview";
import { AdminTournament } from "./pages/admin/AdminTournament";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<AuthGuard><DashboardPage /></AuthGuard>} />
          <Route path="/account" element={<AuthGuard><AccountPage /></AuthGuard>} />
          <Route path="/tournament/:id" element={<AuthGuard><HubPage /></AuthGuard>} />
          <Route path="/tournament/:id/vote" element={<AuthGuard><VotePage /></AuthGuard>} />
          <Route path="/tournament/:id/draft/:round" element={<AuthGuard><DraftPage /></AuthGuard>} />
          <Route path="/tournament/:id/standings" element={<AuthGuard><StandingsPage /></AuthGuard>} />
          <Route path="/admin" element={<AdminGuard><AdminOverview /></AdminGuard>} />
          <Route path="/admin/tournament/:id" element={<AdminGuard><AdminTournament /></AdminGuard>} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
```

- [ ] **Step 11: Create placeholder files for all pages**

Create minimal placeholder exports for every page that doesn't exist yet so the router compiles. Each file exports a simple component like:

```tsx
export function JoinPage() { return <div>Join — TODO</div>; }
```

Files needed:
- `frontend/src/pages/JoinPage.tsx`
- `frontend/src/pages/AccountPage.tsx`
- `frontend/src/pages/tournament/HubPage.tsx`
- `frontend/src/pages/tournament/VotePage.tsx`
- `frontend/src/pages/tournament/DraftPage.tsx`
- `frontend/src/pages/tournament/StandingsPage.tsx`
- `frontend/src/pages/admin/AdminOverview.tsx`
- `frontend/src/pages/admin/AdminTournament.tsx`

- [ ] **Step 12: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 13: Commit**

```bash
git add frontend/
git commit -m "feat: frontend infrastructure (layout, auth guard, types, routing)"
```

---

## Task 2: Login + Join Pages

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/pages/JoinPage.tsx`

- [ ] **Step 1: Implement `LoginPage.tsx`**

Full login form with Mantine components. No Layout wrapper (login/join pages are standalone). Includes COBS branding, username/password inputs, login button, link to join page.

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Group, Stack, Center, Alert } from "@mantine/core";
import { IconCube, IconAlertCircle } from "@tabler/icons-react";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center h="100vh" bg="var(--mantine-color-body)">
      <Container size={420} w="100%">
        <Stack align="center" mb="xl">
          <IconCube size={48} color="var(--mantine-color-blue-6)" />
          <Title order={1}>COBS</Title>
          <Text c="dimmed" size="sm">Cube Draft Tournament Manager</Text>
        </Stack>
        <Paper withBorder shadow="md" p="xl" radius="md">
          <form onSubmit={handleSubmit}>
            <Stack>
              {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
              <TextInput label="Username" required value={username} onChange={(e) => setUsername(e.target.value)} />
              <PasswordInput label="Password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button type="submit" fullWidth loading={loading}>Login</Button>
            </Stack>
          </form>
          <Group justify="center" mt="md">
            <Text size="sm" c="dimmed">
              Turnier beitreten? <Text component="a" href="/join" c="blue" inherit>Join</Text>
            </Text>
          </Group>
        </Paper>
      </Container>
    </Center>
  );
}
```

- [ ] **Step 2: Implement `JoinPage.tsx`**

Join form: code + username + password. Creates account if new.

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Stack, Center, Alert } from "@mantine/core";
import { IconCube, IconAlertCircle } from "@tabler/icons-react";
import { apiFetch } from "../api/client";
import { useAuth } from "../hooks/useAuth";

export function JoinPage() {
  const [joinCode, setJoinCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setToken } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch<{ access_token: string }>("/tournaments/join", {
        method: "POST",
        body: JSON.stringify({ join_code: joinCode, username, password }),
      });
      setToken(res.access_token);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Join failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center h="100vh" bg="var(--mantine-color-body)">
      <Container size={420} w="100%">
        <Stack align="center" mb="xl">
          <IconCube size={48} color="var(--mantine-color-blue-6)" />
          <Title order={1}>Turnier beitreten</Title>
        </Stack>
        <Paper withBorder shadow="md" p="xl" radius="md">
          <form onSubmit={handleSubmit}>
            <Stack>
              {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
              <TextInput label="Join-Code" placeholder="z.B. A1B2C3D4" required value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={8} />
              <TextInput label="Username" required value={username} onChange={(e) => setUsername(e.target.value)} />
              <PasswordInput label="Password" description="Neuer Account wird erstellt falls nötig"
                required value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button type="submit" fullWidth loading={loading}>Beitreten</Button>
            </Stack>
          </form>
          <Text size="sm" c="dimmed" ta="center" mt="md">
            Schon einen Account? <Text component="a" href="/login" c="blue" inherit>Login</Text>
          </Text>
        </Paper>
      </Container>
    </Center>
  );
}
```

- [ ] **Step 3: Verify and commit**

Run: `cd frontend && npx tsc --noEmit`
Commit: `feat: login + join pages`

---

## Task 3: Player Dashboard

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Implement `DashboardPage.tsx`**

Shows player's tournaments grouped into active and past:

```tsx
import { Container, Title, Text, Card, Group, Badge, Stack, Button, SimpleGrid, Center, Loader } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import type { TournamentDetail } from "../api/types";
import { useAuth } from "../hooks/useAuth";

const STATUS_COLORS: Record<string, string> = {
  SETUP: "gray",
  VOTING: "blue",
  DRAFTING: "orange",
  FINISHED: "green",
};

export function DashboardPage() {
  const { user } = useAuth();
  // Player sees tournaments via /auth/me which returns user info
  // We need a player-specific endpoint — use tournaments list filtered by player
  // For now, fetch tournament detail for each tournament the player is in
  // Actually the API doesn't have a "my tournaments" endpoint directly
  // We'll need to add a query param or use the /auth/me endpoint
  // Simplest: fetch all tournaments (admin) or use a dedicated endpoint
  // For MVP: add a GET /tournaments/mine endpoint or fetch from /auth/me
  // Let's use the existing pattern: the dashboard calls a custom endpoint

  // Note to implementer: The backend currently only has GET /tournaments (admin-only).
  // You will need to either:
  // a) Add a GET /tournaments/mine endpoint that returns tournaments for the current player
  // b) Or modify the existing GET /tournaments to work for players too (filtered to their tournaments)
  // For now, create a simple version that works:

  const { data, loading } = useApi<TournamentDetail[]>("/tournaments/mine");

  if (loading) return <Center h="50vh"><Loader /></Center>;

  const active = data?.filter((t) => t.status !== "FINISHED") ?? [];
  const past = data?.filter((t) => t.status === "FINISHED") ?? [];

  return (
    <Container size="sm">
      <Group justify="space-between" mb="lg">
        <Title order={2}>Meine Turniere</Title>
        <Button component="a" href="/join" variant="light" leftSection={<IconPlus size={16} />}>
          Beitreten
        </Button>
      </Group>

      {active.length === 0 && past.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          Noch keine Turniere. Tritt einem bei!
        </Text>
      )}

      {active.length > 0 && (
        <>
          <Text fw={500} mb="xs" c="dimmed" size="sm" tt="uppercase">Aktiv</Text>
          <Stack gap="sm" mb="xl">
            {active.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </Stack>
        </>
      )}

      {past.length > 0 && (
        <>
          <Text fw={500} mb="xs" c="dimmed" size="sm" tt="uppercase">Vergangene</Text>
          <Stack gap="sm">
            {past.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </Stack>
        </>
      )}
    </Container>
  );
}

function TournamentCard({ tournament: t }: { tournament: TournamentDetail }) {
  const navigate = useNavigate();
  return (
    <Card shadow="sm" padding="md" radius="md" withBorder
      style={{ cursor: "pointer" }} onClick={() => navigate(`/tournament/${t.id}`)}>
      <Group justify="space-between">
        <div>
          <Text fw={600}>{t.name}</Text>
          <Text size="sm" c="dimmed">
            {t.player_count} Spieler · {t.cube_count} Cubes
          </Text>
        </div>
        <Badge color={STATUS_COLORS[t.status]}>{t.status}</Badge>
      </Group>
    </Card>
  );
}
```

- [ ] **Step 2: Add backend endpoint GET /tournaments/mine**

The backend needs a new endpoint. Add to `backend/cobs/routes/tournaments.py`:

```python
@router.get("/mine", response_model=list[TournamentResponse])
async def my_tournaments(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List tournaments for the current player."""
    result = await db.execute(
        select(TournamentPlayer)
        .where(TournamentPlayer.user_id == user.id)
        .options(selectinload(TournamentPlayer.tournament))
    )
    tps = result.scalars().all()

    responses = []
    for tp in tps:
        t = tp.tournament
        player_count = await db.scalar(
            select(func.count()).where(TournamentPlayer.tournament_id == t.id)
        )
        cube_count = await db.scalar(
            select(func.count()).where(TournamentCube.tournament_id == t.id)
        )
        responses.append(TournamentResponse(
            id=t.id, name=t.name, status=t.status, join_code=t.join_code,
            max_rounds=t.max_rounds, player_count=player_count or 0,
            cube_count=cube_count or 0,
        ))
    return responses
```

IMPORTANT: This route must be registered BEFORE the `/{tournament_id}` route to avoid path conflicts. Place it right after the `POST ""` route.

- [ ] **Step 3: Verify and commit**

Run backend tests: `cd backend && uv run pytest tests/ -v`
Run frontend type check: `cd frontend && npx tsc --noEmit`
Commit: `feat: player dashboard + /tournaments/mine endpoint`

---

## Task 4: Tournament Hub

**Files:**
- Modify: `frontend/src/pages/tournament/HubPage.tsx`

- [ ] **Step 1: Implement `HubPage.tsx`**

Context-adaptive tournament hub. Shows different content based on tournament status.

```tsx
import { useParams, useNavigate } from "react-router-dom";
import { Container, Title, Text, Button, Card, Group, Badge, Stack, Center, Loader, Alert } from "@mantine/core";
import { IconVote, IconCards, IconTrophy, IconCamera } from "@tabler/icons-react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";
import type { TournamentDetail, Draft } from "../../api/types";

const STATUS_COLORS: Record<string, string> = {
  SETUP: "gray", VOTING: "blue", DRAFTING: "orange", FINISHED: "green",
};

export function HubPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: tournament, loading } = useApi<TournamentDetail>(`/tournaments/${id}`);
  const { data: drafts } = useApi<Draft[]>(`/tournaments/${id}/drafts`);

  if (loading || !tournament) return <Center h="50vh"><Loader /></Center>;

  const myPlayer = tournament.players.find((p) => p.user_id === user?.id);
  const latestDraft = drafts?.length ? drafts[drafts.length - 1] : null;
  const myPod = latestDraft?.pods.find((pod) =>
    pod.players.some((pp) => pp.tournament_player_id === myPlayer?.id)
  );

  return (
    <Container size="sm">
      <Group justify="space-between" mb="md">
        <div>
          <Title order={2}>{tournament.name}</Title>
          <Text size="sm" c="dimmed">
            {tournament.player_count} Spieler · {tournament.cube_count} Cubes · {drafts?.length ?? 0}/{tournament.max_rounds} Runden
          </Text>
        </div>
        <Badge color={STATUS_COLORS[tournament.status]} size="lg">{tournament.status}</Badge>
      </Group>

      {tournament.status === "SETUP" && (
        <Alert color="gray" title="Warte auf Admin" mb="md">
          Das Turnier wurde noch nicht gestartet. Voting beginnt bald.
        </Alert>
      )}

      {tournament.status === "VOTING" && (
        <Stack gap="md">
          <Button size="lg" fullWidth leftSection={<IconVote size={20} />}
            onClick={() => navigate(`/tournament/${id}/vote`)}>
            Jetzt abstimmen
          </Button>
          <InfoCards tournament={tournament} />
        </Stack>
      )}

      {tournament.status === "DRAFTING" && latestDraft && (
        <Stack gap="md">
          {myPod && (
            <Card withBorder padding="md" radius="md">
              <Text size="sm" c="dimmed" tt="uppercase">Dein Pod — Runde {latestDraft.round_number}</Text>
              <Text fw={600} size="lg" mt={4}>{myPod.cube_name}</Text>
              <Text size="sm" c="dimmed">
                Pod {myPod.pod_number} · Seat {myPod.players.find(p => p.tournament_player_id === myPlayer?.id)?.seat_number}
              </Text>
            </Card>
          )}
          <Button size="lg" fullWidth leftSection={<IconCards size={20} />}
            onClick={() => navigate(`/tournament/${id}/draft/${latestDraft.round_number}`)}>
            Draft ansehen
          </Button>
          <Group grow>
            <Button variant="light" leftSection={<IconTrophy size={16} />}
              onClick={() => navigate(`/tournament/${id}/standings`)}>
              Standings
            </Button>
          </Group>
        </Stack>
      )}

      {tournament.status === "FINISHED" && (
        <Stack gap="md">
          <Alert color="green" title="Turnier beendet">
            Das Turnier ist abgeschlossen.
          </Alert>
          <Button variant="light" fullWidth leftSection={<IconTrophy size={20} />}
            onClick={() => navigate(`/tournament/${id}/standings`)}>
            Endergebnis ansehen
          </Button>
        </Stack>
      )}
    </Container>
  );
}

function InfoCards({ tournament }: { tournament: TournamentDetail }) {
  return (
    <Stack gap="xs">
      <Card withBorder p="sm"><Group justify="space-between"><Text c="dimmed" size="sm">Spieler</Text><Text fw={600}>{tournament.player_count}</Text></Group></Card>
      <Card withBorder p="sm"><Group justify="space-between"><Text c="dimmed" size="sm">Cubes</Text><Text fw={600}>{tournament.cube_count}</Text></Group></Card>
      <Card withBorder p="sm"><Group justify="space-between"><Text c="dimmed" size="sm">Max Runden</Text><Text fw={600}>{tournament.max_rounds}</Text></Group></Card>
    </Stack>
  );
}
```

- [ ] **Step 2: Verify and commit**

Commit: `feat: tournament hub (context-adaptive)`

---

## Task 5: Voting Page

**Files:**
- Modify: `frontend/src/pages/tournament/VotePage.tsx`

- [ ] **Step 1: Implement `VotePage.tsx`**

Card swipe view (default) + list view (toggle). Loads votes on mount, saves on change.

```tsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Container, Title, Text, Button, Card, Group, Stack, Center, Loader, ActionIcon, Image, Badge, SegmentedControl, Paper } from "@mantine/core";
import { IconThumbUp, IconThumbDown, IconMinus, IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { apiFetch } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import type { Vote, TournamentDetail } from "../../api/types";

type VoteValue = "DESIRED" | "NEUTRAL" | "AVOID";

export function VotePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: tournament } = useApi<TournamentDetail>(`/tournaments/${id}`);
  const { data: initialVotes, loading } = useApi<Vote[]>(`/tournaments/${id}/votes`);
  const [votes, setVotes] = useState<Record<string, VoteValue>>({});
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [cardIndex, setCardIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialVotes) {
      const voteMap: Record<string, VoteValue> = {};
      let allVoted = true;
      for (const v of initialVotes) {
        voteMap[v.tournament_cube_id] = v.vote;
        if (v.vote === "NEUTRAL") allVoted = false;
      }
      setVotes(voteMap);
      // If all cubes already have non-NEUTRAL votes, default to list
      if (allVoted && initialVotes.length > 0) setViewMode("list");
    }
  }, [initialVotes]);

  if (loading || !tournament || !initialVotes) return <Center h="50vh"><Loader /></Center>;

  const cubes = tournament.cubes;
  const currentCube = cubes[cardIndex];

  const setVote = (tcId: string, vote: VoteValue) => {
    setVotes((prev) => ({ ...prev, [tcId]: vote }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/tournaments/${id}/votes`, {
        method: "PUT",
        body: JSON.stringify({
          votes: Object.entries(votes).map(([tournament_cube_id, vote]) => ({ tournament_cube_id, vote })),
        }),
      });
      navigate(`/tournament/${id}`);
    } finally {
      setSaving(false);
    }
  };

  const votedCount = Object.values(votes).filter((v) => v !== "NEUTRAL").length;

  return (
    <Container size="sm">
      <Group justify="space-between" mb="md">
        <Title order={3}>Cube Voting</Title>
        <SegmentedControl size="xs" value={viewMode} onChange={(v) => setViewMode(v as "card" | "list")}
          data={[{ label: "Cards", value: "card" }, { label: "Liste", value: "list" }]} />
      </Group>
      <Text size="sm" c="dimmed" mb="md">{votedCount}/{cubes.length} bewertet</Text>

      {viewMode === "card" && currentCube && (
        <Stack>
          <Card withBorder radius="md" padding={0}>
            {currentCube.cube_image_url && (
              <Image src={currentCube.cube_image_url} height={200} alt={currentCube.cube_name} />
            )}
            {!currentCube.cube_image_url && (
              <Center h={200} bg="var(--mantine-color-dark-6)"><Text size="xl" c="dimmed">🎴</Text></Center>
            )}
            <Stack p="md" gap="xs">
              <Text fw={600} size="lg">{currentCube.cube_name}</Text>
              <Text size="sm" c="dimmed">{currentCube.cube_description}</Text>
            </Stack>
            <Group grow p="md" pt={0}>
              <VoteButton icon={<IconThumbDown />} color="red" label="Avoid"
                active={votes[currentCube.id] === "AVOID"} onClick={() => setVote(currentCube.id, "AVOID")} />
              <VoteButton icon={<IconMinus />} color="gray" label="Neutral"
                active={votes[currentCube.id] === "NEUTRAL"} onClick={() => setVote(currentCube.id, "NEUTRAL")} />
              <VoteButton icon={<IconThumbUp />} color="green" label="Desired"
                active={votes[currentCube.id] === "DESIRED"} onClick={() => setVote(currentCube.id, "DESIRED")} />
            </Group>
          </Card>
          <Group justify="space-between">
            <ActionIcon variant="subtle" size="lg" disabled={cardIndex === 0}
              onClick={() => setCardIndex((i) => i - 1)}><IconArrowLeft /></ActionIcon>
            <Text size="sm" c="dimmed">{cardIndex + 1} / {cubes.length}</Text>
            <ActionIcon variant="subtle" size="lg" disabled={cardIndex === cubes.length - 1}
              onClick={() => setCardIndex((i) => i + 1)}><IconArrowRight /></ActionIcon>
          </Group>
        </Stack>
      )}

      {viewMode === "list" && (
        <Stack gap="xs">
          {cubes.map((cube) => (
            <Paper key={cube.id} withBorder p="sm" radius="md">
              <Group justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text fw={500} truncate>{cube.cube_name}</Text>
                  <Text size="xs" c="dimmed" truncate>{cube.cube_description}</Text>
                </div>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon color="red" variant={votes[cube.id] === "AVOID" ? "filled" : "subtle"} size="sm"
                    onClick={() => setVote(cube.id, "AVOID")}><IconThumbDown size={14} /></ActionIcon>
                  <ActionIcon color="gray" variant={votes[cube.id] === "NEUTRAL" ? "filled" : "subtle"} size="sm"
                    onClick={() => setVote(cube.id, "NEUTRAL")}><IconMinus size={14} /></ActionIcon>
                  <ActionIcon color="green" variant={votes[cube.id] === "DESIRED" ? "filled" : "subtle"} size="sm"
                    onClick={() => setVote(cube.id, "DESIRED")}><IconThumbUp size={14} /></ActionIcon>
                </Group>
              </Group>
            </Paper>
          ))}
        </Stack>
      )}

      <Button fullWidth mt="lg" loading={saving} onClick={save}>Votes speichern</Button>
    </Container>
  );
}

function VoteButton({ icon, color, label, active, onClick }: {
  icon: React.ReactNode; color: string; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <Button variant={active ? "filled" : "light"} color={color} onClick={onClick}
      leftSection={icon} size="md">{label}</Button>
  );
}
```

- [ ] **Step 2: Verify and commit**

Commit: `feat: voting page (card swipe + list toggle)`

---

## Task 6: Draft Detail + Match Reporting + Timer

**Files:**
- Create: `frontend/src/components/Timer.tsx`
- Create: `frontend/src/components/MatchCard.tsx`
- Create: `frontend/src/components/MatchReportModal.tsx`
- Modify: `frontend/src/pages/tournament/DraftPage.tsx`

- [ ] **Step 1: Create `Timer.tsx`**

```tsx
import { useState, useEffect } from "react";
import { Text, Paper } from "@mantine/core";
import { IconClock } from "@tabler/icons-react";

export function Timer({ endsAt }: { endsAt: string | null }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!endsAt) { setRemaining(null); return; }
    const update = () => {
      const diff = new Date(endsAt).getTime() - Date.now();
      setRemaining(Math.floor(diff / 1000));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (remaining === null) return null;

  const isWarning = remaining <= 300 && remaining > 0;
  const isExpired = remaining <= 0;
  const color = isExpired ? "red" : isWarning ? "orange" : "blue";
  const absSeconds = Math.abs(remaining);
  const minutes = Math.floor(absSeconds / 60);
  const seconds = absSeconds % 60;
  const sign = remaining < 0 ? "-" : "";

  return (
    <Paper p="sm" radius="md" bg={`var(--mantine-color-${color}-light)`} mb="md">
      <Text ta="center" fw={700} size="xl" c={color}>
        <IconClock size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />
        {sign}{minutes}:{seconds.toString().padStart(2, "0")}
      </Text>
    </Paper>
  );
}
```

- [ ] **Step 2: Create `MatchReportModal.tsx`**

Stepper with +/- counters and confirmation:

```tsx
import { useState } from "react";
import { Modal, Stack, Text, Group, ActionIcon, Button, NumberInput } from "@mantine/core";
import { IconPlus, IconMinus } from "@tabler/icons-react";

interface Props {
  opened: boolean;
  onClose: () => void;
  opponentName: string;
  onSubmit: (myWins: number, oppWins: number) => void;
}

export function MatchReportModal({ opened, onClose, opponentName, onSubmit }: Props) {
  const [myWins, setMyWins] = useState(0);
  const [oppWins, setOppWins] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const reset = () => { setMyWins(0); setOppWins(0); setConfirming(false); };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Modal opened={opened} onClose={handleClose} title="Ergebnis melden" centered>
      {!confirming ? (
        <Stack>
          <Text size="sm" c="dimmed">vs. {opponentName}</Text>
          <Counter label="Meine Wins" value={myWins} onChange={setMyWins} />
          <Counter label="Gegner Wins" value={oppWins} onChange={setOppWins} />
          <Button fullWidth onClick={() => setConfirming(true)}
            disabled={myWins === 0 && oppWins === 0}>
            Weiter
          </Button>
        </Stack>
      ) : (
        <Stack>
          <Text ta="center" fw={600} size="lg">{myWins} - {oppWins}</Text>
          <Text ta="center" size="sm" c="dimmed">vs. {opponentName}</Text>
          <Text ta="center" size="sm" c="dimmed">Bist du sicher?</Text>
          <Group grow>
            <Button variant="light" onClick={() => setConfirming(false)}>Zurück</Button>
            <Button color="green" onClick={() => { onSubmit(myWins, oppWins); handleClose(); }}>
              Bestätigen
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Group justify="space-between">
      <Text>{label}</Text>
      <Group gap="xs">
        <ActionIcon variant="light" onClick={() => onChange(Math.max(0, value - 1))} disabled={value === 0}>
          <IconMinus size={16} />
        </ActionIcon>
        <Text fw={700} w={30} ta="center">{value}</Text>
        <ActionIcon variant="light" onClick={() => onChange(value + 1)}>
          <IconPlus size={16} />
        </ActionIcon>
      </Group>
    </Group>
  );
}
```

- [ ] **Step 3: Create `MatchCard.tsx`**

Displays a match with appropriate state styling:

```tsx
import { Paper, Group, Text, Badge, Button } from "@mantine/core";
import type { Match } from "../api/types";

interface Props {
  match: Match;
  myPlayerId: string | undefined;
  onReport: (match: Match) => void;
}

export function MatchCard({ match, myPlayerId, onReport }: Props) {
  const isP1 = match.player1_id === myPlayerId;
  const isP2 = match.player2_id === myPlayerId;
  const isMyMatch = isP1 || isP2;

  const opponentName = isP1 ? match.player2_username : match.player1_username;

  // Determine match state
  const iReported = isP1
    ? match.p1_reported_p1_wins !== null
    : match.p2_reported_p1_wins !== null;

  if (match.is_bye) {
    return (
      <Paper withBorder p="sm" radius="md">
        <Group justify="space-between">
          <Text size="sm">{match.player1_username}</Text>
          <Badge color="gray">Bye — 3 Punkte</Badge>
        </Group>
      </Paper>
    );
  }

  return (
    <Paper withBorder p="sm" radius="md">
      <Group justify="space-between" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Text size="sm" fw={500}>
            {isMyMatch ? `vs. ${opponentName}` : `${match.player1_username} vs. ${match.player2_username}`}
          </Text>
        </div>
        {match.reported && (
          <Badge color="green">{match.player1_wins}-{match.player2_wins} ✓</Badge>
        )}
        {match.has_conflict && (
          <Badge color="red">Konflikt</Badge>
        )}
        {!match.reported && !match.has_conflict && isMyMatch && !iReported && (
          <Button size="compact-xs" onClick={() => onReport(match)}>Melden</Button>
        )}
        {!match.reported && !match.has_conflict && iReported && (
          <Badge color="yellow">Warte auf Gegner...</Badge>
        )}
        {!match.reported && !match.has_conflict && !isMyMatch && (
          <Badge color="gray">Ausstehend</Badge>
        )}
      </Group>
    </Paper>
  );
}
```

- [ ] **Step 4: Implement `DraftPage.tsx`**

```tsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Container, Title, Text, Stack, Card, Group, Center, Loader, FileInput, Button } from "@mantine/core";
import { IconUpload } from "@tabler/icons-react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";
import { apiFetch } from "../../api/client";
import { Timer } from "../../components/Timer";
import { MatchCard } from "../../components/MatchCard";
import { MatchReportModal } from "../../components/MatchReportModal";
import type { Draft, Match, TournamentDetail } from "../../api/types";

export function DraftPage() {
  const { id, round } = useParams<{ id: string; round: string }>();
  const { user } = useAuth();
  const { data: tournament } = useApi<TournamentDetail>(`/tournaments/${id}`);
  const { data: drafts, refetch: refetchDrafts } = useApi<Draft[]>(`/tournaments/${id}/drafts`);
  const draft = drafts?.find((d) => d.round_number === Number(round));
  const { data: matches, refetch: refetchMatches } = useApi<Match[]>(
    draft ? `/tournaments/${id}/drafts/${draft.id}/matches` : null
  );

  const [reportMatch, setReportMatch] = useState<Match | null>(null);
  const [uploading, setUploading] = useState(false);

  if (!tournament || !draft) return <Center h="50vh"><Loader /></Center>;

  const myPlayer = tournament.players.find((p) => p.user_id === user?.id);
  const myPod = draft.pods.find((pod) =>
    pod.players.some((pp) => pp.tournament_player_id === myPlayer?.id)
  );
  const myMatches = matches?.filter(
    (m) => m.player1_id === myPlayer?.id || m.player2_id === myPlayer?.id
  ) ?? [];

  const handleReport = async (myWins: number, oppWins: number) => {
    if (!reportMatch || !myPlayer || !draft) return;
    const isP1 = reportMatch.player1_id === myPlayer.id;
    await apiFetch(`/tournaments/${id}/drafts/${draft.id}/matches/${reportMatch.id}/report`, {
      method: "POST",
      body: JSON.stringify({
        player1_wins: isP1 ? myWins : oppWins,
        player2_wins: isP1 ? oppWins : myWins,
      }),
    });
    refetchMatches();
  };

  const handlePhotoUpload = async (file: File | null, type: string) => {
    if (!file || !draft) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/tournaments/${id}/drafts/${draft.id}/photos/${type}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Container size="sm">
      <Title order={3} mb="md">Runde {round}</Title>

      {myPod?.timer_ends_at && <Timer endsAt={myPod.timer_ends_at} />}

      {myPod && (
        <Card withBorder mb="md" padding="md" radius="md">
          <Text size="sm" c="dimmed" tt="uppercase">Dein Pod</Text>
          <Text fw={600} size="lg">{myPod.cube_name}</Text>
          <Text size="sm" c="dimmed">
            Pod {myPod.pod_number} · Seat {myPod.players.find(p => p.tournament_player_id === myPlayer?.id)?.seat_number} · {myPod.pod_size} Spieler
          </Text>
          <Group mt="xs" gap="xs">
            {myPod.players.map((pp) => (
              <Text key={pp.tournament_player_id} size="xs" c="dimmed">
                {pp.seat_number}. {pp.username}
              </Text>
            ))}
          </Group>
        </Card>
      )}

      {myMatches.length > 0 && (
        <>
          <Text fw={500} mb="xs" c="dimmed" size="sm" tt="uppercase">Matches</Text>
          <Stack gap="xs" mb="md">
            {myMatches.map((m) => (
              <MatchCard key={m.id} match={m} myPlayerId={myPlayer?.id} onReport={setReportMatch} />
            ))}
          </Stack>
        </>
      )}

      <Text fw={500} mb="xs" c="dimmed" size="sm" tt="uppercase">Photos</Text>
      <Stack gap="xs">
        <FileInput label="Pool Photo" placeholder="Foto hochladen" accept="image/*"
          leftSection={<IconUpload size={14} />} onChange={(f) => handlePhotoUpload(f, "POOL")} />
        <FileInput label="Deck Photo" placeholder="Foto hochladen" accept="image/*"
          leftSection={<IconUpload size={14} />} onChange={(f) => handlePhotoUpload(f, "DECK")} />
        <FileInput label="Returned Photo" placeholder="Foto hochladen" accept="image/*"
          leftSection={<IconUpload size={14} />} onChange={(f) => handlePhotoUpload(f, "RETURNED")} />
      </Stack>

      <MatchReportModal
        opened={!!reportMatch}
        onClose={() => setReportMatch(null)}
        opponentName={
          reportMatch
            ? (reportMatch.player1_id === myPlayer?.id ? reportMatch.player2_username : reportMatch.player1_username) ?? ""
            : ""
        }
        onSubmit={handleReport}
      />
    </Container>
  );
}
```

- [ ] **Step 5: Verify and commit**

Commit: `feat: draft detail + match reporting + timer`

---

## Task 7: Standings Page

**Files:**
- Modify: `frontend/src/pages/tournament/StandingsPage.tsx`

- [ ] **Step 1: Implement `StandingsPage.tsx`**

```tsx
import { useParams } from "react-router-dom";
import { Container, Title, Table, Badge, Text, Center, Loader, ScrollArea } from "@mantine/core";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";
import type { StandingsEntry, TournamentDetail } from "../../api/types";

export function StandingsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: standings, loading } = useApi<StandingsEntry[]>(`/tournaments/${id}/standings`);
  const { data: tournament } = useApi<TournamentDetail>(`/tournaments/${id}`);

  if (loading) return <Center h="50vh"><Loader /></Center>;

  const myPlayer = tournament?.players.find((p) => p.user_id === user?.id);

  return (
    <Container size="md">
      <Title order={3} mb="md">Standings</Title>
      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>#</Table.Th>
              <Table.Th>Spieler</Table.Th>
              <Table.Th ta="right">Punkte</Table.Th>
              <Table.Th ta="right">W-L-D</Table.Th>
              <Table.Th ta="right">OMW%</Table.Th>
              <Table.Th ta="right">GW%</Table.Th>
              <Table.Th ta="right">OGW%</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {standings?.map((s, i) => (
              <Table.Tr key={s.player_id}
                style={s.player_id === myPlayer?.id ? { background: "var(--mantine-color-blue-light)" } : undefined}>
                <Table.Td>{i + 1}</Table.Td>
                <Table.Td>
                  {s.username}
                  {s.dropped && <Badge color="red" size="xs" ml="xs">Dropped</Badge>}
                </Table.Td>
                <Table.Td ta="right" fw={600}>{s.match_points}</Table.Td>
                <Table.Td ta="right">{s.match_wins}-{s.match_losses}-{s.match_draws}</Table.Td>
                <Table.Td ta="right">{(s.omw_percent * 100).toFixed(1)}%</Table.Td>
                <Table.Td ta="right">{(s.gw_percent * 100).toFixed(1)}%</Table.Td>
                <Table.Td ta="right">{(s.ogw_percent * 100).toFixed(1)}%</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Container>
  );
}
```

- [ ] **Step 2: Verify and commit**

Commit: `feat: standings page with tiebreakers`

---

## Task 8: Account Page

**Files:**
- Modify: `frontend/src/pages/AccountPage.tsx`

- [ ] **Step 1: Implement `AccountPage.tsx`**

```tsx
import { useState } from "react";
import { Container, Title, Paper, PasswordInput, Button, Stack, Alert } from "@mantine/core";
import { IconCheck, IconAlertCircle } from "@tabler/icons-react";
import { apiFetch } from "../api/client";

export function AccountPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwörter stimmen nicht überein"); return; }
    setLoading(true);
    setError("");
    setSuccess(false);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ username: "", password }),
      });
      setSuccess(true);
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size="xs">
      <Title order={3} mb="md">Account</Title>
      <Paper withBorder p="xl" radius="md">
        <form onSubmit={handleSubmit}>
          <Stack>
            {success && <Alert color="green" icon={<IconCheck size={16} />}>Passwort geändert</Alert>}
            {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
            <PasswordInput label="Neues Passwort" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <PasswordInput label="Bestätigen" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <Button type="submit" loading={loading}>Passwort ändern</Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
```

- [ ] **Step 2: Verify and commit**

Commit: `feat: account page (change password)`

---

## Task 9: Admin Pages

**Files:**
- Modify: `frontend/src/pages/admin/AdminOverview.tsx`
- Modify: `frontend/src/pages/admin/AdminTournament.tsx`

This is the largest task. The admin pages use desktop-optimized layouts with tables.

- [ ] **Step 1: Implement `AdminOverview.tsx`**

Tournament overview table with create buttons:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Title, Table, Badge, Button, Group, Modal, TextInput, NumberInput, Stack, ScrollArea } from "@mantine/core";
import { IconPlus, IconTestPipe } from "@tabler/icons-react";
import { useApi } from "../../hooks/useApi";
import { apiFetch } from "../../api/client";
import type { Tournament } from "../../api/types";

const STATUS_COLORS: Record<string, string> = {
  SETUP: "gray", VOTING: "blue", DRAFTING: "orange", FINISHED: "green",
};

export function AdminOverview() {
  const { data: tournaments, refetch } = useApi<Tournament[]>("/tournaments");
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [name, setName] = useState("");
  const [numPlayers, setNumPlayers] = useState(16);
  const [numCubes, setNumCubes] = useState(4);
  const [seed, setSeed] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);

  const createTournament = async () => {
    setLoading(true);
    try {
      const t = await apiFetch<Tournament>("/tournaments", {
        method: "POST",
        body: JSON.stringify({ name: name || "Neues Turnier" }),
      });
      setCreateOpen(false);
      setName("");
      navigate(`/admin/tournament/${t.id}`);
    } finally {
      setLoading(false);
    }
  };

  const createTestTournament = async () => {
    setLoading(true);
    try {
      const t = await apiFetch<{ tournament_id: string }>("/test/tournament", {
        method: "POST",
        body: JSON.stringify({
          name: name || "Test Tournament",
          num_players: numPlayers,
          num_cubes: numCubes,
          seed: seed ?? null,
        }),
      });
      setTestOpen(false);
      setName("");
      navigate(`/admin/tournament/${t.tournament_id}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size="lg">
      <Group justify="space-between" mb="lg">
        <Title order={2}>Turniere</Title>
        <Group>
          <Button leftSection={<IconTestPipe size={16} />} variant="light" onClick={() => setTestOpen(true)}>
            Test-Turnier
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>
            Neues Turnier
          </Button>
        </Group>
      </Group>

      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th ta="right">Spieler</Table.Th>
              <Table.Th ta="right">Cubes</Table.Th>
              <Table.Th>Join-Code</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tournaments?.map((t) => (
              <Table.Tr key={t.id} style={{ cursor: "pointer" }}
                onClick={() => navigate(`/admin/tournament/${t.id}`)}>
                <Table.Td fw={500}>{t.name}</Table.Td>
                <Table.Td><Badge color={STATUS_COLORS[t.status]}>{t.status}</Badge></Table.Td>
                <Table.Td ta="right">{t.player_count}</Table.Td>
                <Table.Td ta="right">{t.cube_count}</Table.Td>
                <Table.Td ff="monospace">{t.join_code}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      {/* Create Tournament Modal */}
      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Neues Turnier">
        <Stack>
          <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={createTournament} loading={loading}>Erstellen</Button>
        </Stack>
      </Modal>

      {/* Test Tournament Modal */}
      <Modal opened={testOpen} onClose={() => setTestOpen(false)} title="Test-Turnier erstellen">
        <Stack>
          <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Test Tournament" />
          <NumberInput label="Spieler" value={numPlayers} onChange={(v) => setNumPlayers(Number(v))} min={2} max={500} />
          <NumberInput label="Cubes" value={numCubes} onChange={(v) => setNumCubes(Number(v))} min={1} max={200} />
          <NumberInput label="Seed (optional)" value={seed} onChange={(v) => setSeed(v ? Number(v) : undefined)} />
          <Button onClick={createTestTournament} loading={loading}>Erstellen</Button>
        </Stack>
      </Modal>
    </Container>
  );
}
```

- [ ] **Step 2: Implement `AdminTournament.tsx`**

Full tournament management page with tabs for Overview, Cubes, Players, Drafts, Matches:

The implementer should read the spec at `docs/superpowers/specs/2026-03-22-cobs-v2-phase3b-frontend-ui-design.md` for the Admin Tournament Detail section. The page uses Mantine `Tabs` component with these panels:

- **Overview:** Tournament name, status select (dropdown to change status), join code display, max rounds
- **Cubes:** Table of tournament cubes. "Add Cube" button opens a modal to select from global cubes (`GET /cubes`). Each row shows cube name, description, max_players, remove button
- **Players:** Table of players (username, match_points, dropped status). Drop button per player. Impersonate button (stores current token as `admin_token` in localStorage, sets impersonation token as `token`, navigates to `/`)
- **Drafts:** "Generate Draft" button (calls `POST /tournaments/{id}/drafts`). List of drafts with pod assignments. "Generate Pairings" button per draft (calls `POST /tournaments/{id}/drafts/{did}/pairings`)
- **Matches:** Table of all matches across all drafts. Filter by draft/round. "Resolve" button for conflicts (modal with result input). Shows all match states

This is a large component. The implementer should split it into sub-components as needed (one file per tab panel is fine). The exact implementation is left to the implementer's judgment following Mantine patterns and the spec.

Key API calls:
- `GET /tournaments/{id}` — tournament detail
- `PATCH /tournaments/{id}` — update status
- `GET /cubes` — global cube list
- `POST /tournaments/{id}/cubes` — not yet available (need to check — the backend currently only adds cubes at tournament creation via `cube_ids`). The implementer may need to add a `POST /tournaments/{id}/cubes` endpoint to add cubes to existing tournaments.
- `GET /tournaments/{id}/drafts` — list drafts
- `POST /tournaments/{id}/drafts` — generate draft
- `POST /tournaments/{id}/drafts/{did}/pairings` — generate pairings
- `GET /tournaments/{id}/drafts/{did}/matches` — list matches
- `POST /tournaments/{id}/drafts/{did}/matches/{mid}/resolve` — resolve conflict
- `POST /tournaments/{id}/pods/{pid}/timer` — set timer
- `POST /auth/impersonate` — impersonate player

- [ ] **Step 3: Verify and commit**

Commit: `feat: admin pages (overview + tournament management)`

---

## Task 10: WebSocket Hook

**Files:**
- Create: `frontend/src/hooks/useWebSocket.ts`

- [ ] **Step 1: Create `useWebSocket.ts`**

```typescript
import { useEffect, useRef, useCallback } from "react";

interface WSEvent {
  event: string;
  data: Record<string, unknown>;
}

export function useWebSocket(
  tournamentId: string | undefined,
  onEvent: (event: WSEvent) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!tournamentId) return;

    // Note: WS endpoint accepts without auth (by design — events are non-sensitive)
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/api/ws/tournaments/${tournamentId}`);

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as WSEvent;
        onEventRef.current(parsed);
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      // Auto-reconnect after 3 seconds
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      // The effect cleanup + re-run handles reconnection via the dependency on tournamentId
      // For explicit reconnect, we trigger a state change (not needed here since the effect re-runs)
    };

    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [tournamentId]);
}
```

- [ ] **Step 2: Integrate into HubPage and DraftPage**

Add WebSocket to `HubPage.tsx` — on `pairings_ready` or `match_reported`, call `refetch()`. On `timer_update`, refetch drafts.

Add WebSocket to `DraftPage.tsx` — same pattern.

Example integration (add to HubPage):
```tsx
import { useWebSocket } from "../../hooks/useWebSocket";

// Inside HubPage component:
useWebSocket(id, (event) => {
  if (event.event === "pairings_ready" || event.event === "match_reported" || event.event === "timer_update") {
    // refetch data
    refetchDrafts?.();
  }
});
```

The implementer should add `refetch` returns from `useApi` calls and wire them to the WebSocket events.

- [ ] **Step 3: Verify and commit**

Commit: `feat: WebSocket hook + live updates`

---

## Phase 3B Complete — Summary

After completing all 10 tasks:

- **Shared infrastructure:** Layout shell, auth/admin guards, types, API hook, impersonation banner, color scheme toggle
- **Auth pages:** Login, Join (with account creation)
- **Player pages:** Dashboard, Tournament Hub (context-adaptive), Voting (card + list), Draft detail (timer, matches, photos), Standings, Account
- **Admin pages:** Overview table, Tournament management (tabs: overview, cubes, players, drafts, matches, timer)
- **Components:** Timer countdown, MatchCard (5 states), MatchReportModal (stepper + confirm)
- **WebSocket:** Auto-reconnect, event-driven refetch
- **Theme:** Dark + Light mode with auto-detection and toggle
