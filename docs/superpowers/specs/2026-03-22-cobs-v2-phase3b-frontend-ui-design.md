# COBS v2 Phase 3B: Frontend UI Design Spec

## Overview

Mobile-first player UI with a separate desktop-optimized admin area. Built with React 19, Mantine v8, React Router, Vite. Dark + Light mode with auto-detection.

## Navigation Pattern

**Hub-and-Spoke.** Players navigate from a dashboard (list of their tournaments) into a tournament hub. The hub is the central page — it adapts its content based on tournament status (VOTING, DRAFTING, FINISHED) and always shows the most important action prominently.

No persistent bottom tabs. Navigation via back-links and the hub.

**Header:** Every page has a minimal header with: COBS logo (placeholder cube), color scheme toggle (dark/light), and user menu (username dropdown with Account, Logout). Logout clears the JWT from localStorage and redirects to `/login`.

**Impersonation Banner:** When an admin is impersonating a player, a colored banner appears at the top of every page showing "Impersonating [username] — End" with a link to end impersonation (clears the impersonation token, returns admin token).

## Pages

### Player Pages (mobile-first)

| Route | Purpose |
|-------|---------|
| `/login` | Username/password login |
| `/join` | Join tournament via 8-char code, creates account if new |
| `/` | Dashboard — list of my tournaments (active + past) |
| `/tournament/:id` | Tournament hub — context-adaptive based on status |
| `/tournament/:id/vote` | Cube voting (card swipe + list toggle) |
| `/tournament/:id/draft/:round` | Draft detail (pod info, timer, matches, photo upload) |
| `/tournament/:id/standings` | Standings table with tiebreakers |
| `/account` | Change password |

### Admin Pages (desktop-optimized)

| Route | Purpose |
|-------|---------|
| `/admin` | Tournament overview table (all tournaments, counts, status) |
| `/admin/tournament/:id` | Tournament management (cube CRUD, draft generation, pairing, conflict resolution, timer, impersonation) |

## Design Details

### Tournament Hub (`/tournament/:id`)

The hub adapts based on tournament status:

**SETUP:** Shows "Waiting for admin to start voting" + player count + cube list.

**VOTING:** Prominent "Jetzt abstimmen" button at top. Shows vote progress (X of Y cubes rated). Info cards below (player count, cubes, rounds).

**DRAFTING:** Shows timer countdown prominently if active. Current pod + cube assignment. Match list with status (reported/pending/conflict). "Ergebnis melden" button for pending matches. Link to standings + photo upload. "Turnier verlassen" option (drop self) in a collapsible/danger section at the bottom.

**FINISHED:** Final standings summary (top 3), link to full standings. Past draft overview.

### Voting Page (`/tournament/:id/vote`)

Two modes with a toggle:

**Card View (default for first vote):** One cube at a time. Large cube image, name, description. Three buttons below: Avoid (red), Neutral (gray), Desired (green). Progress dots. Swipe or tap to navigate.

**List View (toggle for quick edits):** All cubes visible as compact rows. Thumbnail, name, three toggle buttons per row. "Save" button at bottom.

Default to card view if no votes exist yet, list view if all cubes already voted.

### Match Reporting

**Stepper UI:** Two +/- counters — "My Wins" and "Opponent Wins". Shows current opponent name and match context. Confirm button triggers a confirmation dialog before submitting.

**Dual-report flow:** Both players report independently. If results agree, match auto-finalizes. If conflict, both players see a "Conflict — waiting for admin" status. Admin resolves in admin UI.

**Match states (player view):**
- **Pending:** "Ergebnis melden" button shown
- **I reported, waiting for opponent:** Shows my reported result grayed out + "Warte auf Gegner..." indicator
- **Conflict:** Red badge "Konflikt — Admin wird benachrichtigt"
- **Finalized:** Green checkmark with result (e.g. "2-1 ✓")
- **Bye:** Auto-shown as "Bye — 3 Punkte" with no action needed

### Draft Detail Page (`/tournament/:id/draft/:round`)

- Timer countdown at top (color changes: normal → orange at 5min → red when expired)
- Pod info card (cube name, seat number, pod players)
- Match list with status per swiss round
- Photo upload section (POOL required before R1, RETURNED required before R3 report)

### Standings Page (`/tournament/:id/standings`)

Full table: Rank, Player, Points, W-L-D, OMW%, GW%, OGW%. Current player's row highlighted. Dropped players at bottom with visual indicator.

### Admin Tournament Overview (`/admin`)

Desktop table with columns: Name, Status (badge), Players, Cubes, Drafts, Join Code, Created. Sortable. "Create Tournament" button. "Create Test Tournament" button (modal with: name, num_players, num_cubes, seed fields — creates tournament in VOTING status and navigates to it).

### Admin Tournament Detail (`/admin/tournament/:id`)

Sidebar navigation within admin detail:
- **Overview:** Tournament settings, status control, join code
- **Cubes:** Add/remove cubes from persistent DB, set max_players per cube
- **Players:** Player list, drop players, impersonate
- **Drafts:** Generate new draft (optimizer config), view pods, generate pairings
- **Matches:** View all matches, resolve conflicts, fill random results
- **Timer:** Set/clear timer per pod

Tables everywhere — sortable, filterable where it makes sense. Excel-like feel.

## Theme & Branding

- Mantine v8 default theme
- Dark + Light mode with `defaultColorScheme="auto"` (system detection)
- Toggle button in header/nav
- Accent color: Mantine blue (default)
- Logo: Placeholder cube icon (text "COBS" next to it)

## Technical Decisions

- **State management:** React context for auth. SWR or simple fetch hooks for API data. No Redux/Zustand needed.
- **API client:** Existing `apiFetch` wrapper with JWT from localStorage.
- **WebSocket:** Connect on tournament hub mount, disconnect on unmount. Listen for events (pairings_ready, match_reported, timer_update) to auto-refresh relevant data.
- **File upload:** Native `<input type="file">` with Mantine's styling. Preview before upload.
- **Routing:** React Router v7 with nested routes for tournament pages.
- **Responsive:** Player pages mobile-first (max-width container). Admin pages desktop-first (sidebar + content layout, min-width tables).
