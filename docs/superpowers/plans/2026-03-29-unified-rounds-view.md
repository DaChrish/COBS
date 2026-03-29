# Unified Rounds View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the Matches tab into the Drafts tab (renamed "Runden"), showing matches inline within pod cards grouped by Swiss round as accordions, with a unified flow for generating pairings and advancing rounds.

**Architecture:** Frontend-only refactor of `AdminTournament.tsx`. The DraftsTab component is expanded to load matches per draft, display them inside pod cards grouped by Swiss round (Accordion), and include conflict resolution. The MatchesTab component and its tab entry are removed. No backend changes needed.

**Tech Stack:** React, Mantine UI (Accordion, Tabs, Paper, Badge, Group, Text, Modal), existing `useApi` hook and `apiFetch` client.

---

## File Structure

### Modified Files
- `frontend/src/pages/admin/AdminTournament.tsx` — Refactor DraftsTab to include matches, remove MatchesTab, rename tab

### No new files needed — this is a refactor within the existing file.

---

### Task 1: Load matches data in DraftsTab

**Files:**
- Modify: `frontend/src/pages/admin/AdminTournament.tsx`

The DraftsTab currently loads drafts but not matches. We need to add match loading per draft.

- [ ] **Step 1: Add matches state and loading to DraftsTab**

In the DraftsTab function (line ~310), after the existing `photoStatus` useEffect, add a new state and effect to load matches per draft:

```tsx
const [matchesByDraft, setMatchesByDraft] = useState<Record<string, Match[]>>({});

useEffect(() => {
  if (!drafts) return;
  drafts.forEach(async (draft) => {
    try {
      const matches = await apiFetch<Match[]>(
        `/tournaments/${tournamentId}/drafts/${draft.id}/matches`
      );
      setMatchesByDraft((prev) => ({ ...prev, [draft.id]: matches }));
    } catch {
      // ignore
    }
  });
}, [drafts, tournamentId]);
```

- [ ] **Step 2: Add conflict resolve state**

Add the resolve state that was previously in MatchesTab. After the existing state declarations:

```tsx
const [resolveState, setResolveState] = useState<{
  match: Match;
  draftId: string;
  p1Wins: number;
  p2Wins: number;
} | null>(null);
const [resolving, setResolving] = useState(false);
```

- [ ] **Step 3: Add resolveMatch handler**

After the existing handlers (simulateResults, simulatePhotos, generateDraft, generatePairings), add:

```tsx
const resolveMatch = async () => {
  if (!resolveState) return;
  setResolving(true);
  setError(null);
  try {
    await apiFetch(
      `/tournaments/${tournamentId}/drafts/${resolveState.draftId}/matches/${resolveState.match.id}/resolve`,
      {
        method: "POST",
        body: JSON.stringify({
          player1_wins: resolveState.p1Wins,
          player2_wins: resolveState.p2Wins,
        }),
      }
    );
    setResolveState(null);
    refetch();
  } catch (e) {
    setError(e instanceof Error ? e.message : "Error");
  } finally {
    setResolving(false);
  }
};
```

- [ ] **Step 4: Verify build compiles**

```bash
cd /Users/christoph/git/COBS/frontend && npx vite build 2>&1 | tail -5
```
Expected: Build succeeds (new state/handlers are unused but that's fine for now)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/AdminTournament.tsx
git commit -m "feat: add match data loading and conflict resolution to DraftsTab"
```

---

### Task 2: Render matches inside pod cards with Swiss round accordion

**Files:**
- Modify: `frontend/src/pages/admin/AdminTournament.tsx`

This is the core visual change. Each pod card gets an Accordion of Swiss rounds showing inline match rows.

- [ ] **Step 1: Add Accordion to Mantine imports**

In the Mantine imports at the top of the file, add `Accordion`:

```tsx
import {
  Accordion,
  ActionIcon,
  Container,
  // ... rest unchanged
```

- [ ] **Step 2: Add match rendering inside pod cards**

Inside the pod card `<Paper>` component (after the player badges `<Group>` that ends around the closing `</Group>` for player badges), add the Swiss rounds accordion. Find the closing `</Group>` for the player badges section (after `{p.username}</Badge>`) and add after it:

```tsx
{/* Swiss Rounds */}
{(() => {
  const podMatches = matchesByDraft[draft.id]?.filter(
    (m) => m.pod_id === pod.id
  ) ?? [];
  if (podMatches.length === 0) return null;

  const swissRounds = [...new Set(podMatches.map((m) => m.swiss_round))].sort();
  const latestRound = Math.max(...swissRounds);

  return (
    <Accordion
      variant="separated"
      mt="sm"
      defaultValue={`swiss-${latestRound}`}
      styles={{ item: { borderRadius: 8 }, content: { padding: '4px 0' } }}
    >
      {swissRounds.map((round) => {
        const roundMatches = podMatches.filter((m) => m.swiss_round === round);
        const reported = roundMatches.filter((m) => m.reported).length;
        const total = roundMatches.length;
        const allDone = reported === total;

        return (
          <Accordion.Item key={round} value={`swiss-${round}`}>
            <Accordion.Control>
              <Group justify="space-between" pr="xs">
                <Text size="sm" fw={600}>Swiss {round}</Text>
                <Badge
                  size="xs"
                  variant="light"
                  color={allDone ? "green" : "yellow"}
                >
                  {reported}/{total}
                </Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap={4}>
                {roundMatches.map((m) => (
                  <Group
                    key={m.id}
                    justify="space-between"
                    px="xs"
                    py={4}
                    style={{ borderRadius: 4 }}
                    bg={m.has_conflict ? "var(--mantine-color-red-light)" : undefined}
                  >
                    <Text size="sm" fw={500} style={{ flex: 1 }}>
                      {m.player1_username}
                    </Text>
                    <Text size="sm" fw={600} c="dimmed" ta="center" w={60}>
                      {m.reported
                        ? `${m.player1_wins}–${m.player2_wins}`
                        : m.is_bye
                          ? "BYE"
                          : "–"}
                    </Text>
                    <Text size="sm" fw={500} style={{ flex: 1 }} ta="right">
                      {m.player2_username ?? "—"}
                    </Text>
                    <div style={{ width: 70, textAlign: "right" }}>
                      {m.is_bye ? (
                        <Badge color="gray" size="xs">Bye</Badge>
                      ) : m.has_conflict ? (
                        <Button
                          size="compact-xs"
                          color="red"
                          variant="light"
                          onClick={() =>
                            setResolveState({
                              match: m,
                              draftId: draft.id,
                              p1Wins: m.p1_reported_p1_wins ?? 0,
                              p2Wins: m.p1_reported_p2_wins ?? 0,
                            })
                          }
                        >
                          Lösen
                        </Button>
                      ) : m.reported ? (
                        <Badge color="green" size="xs">✓</Badge>
                      ) : (
                        <Badge color="gray" size="xs">⏳</Badge>
                      )}
                    </div>
                  </Group>
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}
    </Accordion>
  );
})()}
```

- [ ] **Step 3: Verify build compiles**

```bash
cd /Users/christoph/git/COBS/frontend && npx vite build 2>&1 | tail -5
```
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/AdminTournament.tsx
git commit -m "feat: render matches inside pod cards with Swiss round accordion"
```

---

### Task 3: Add conflict resolution modal and overall progress with next round button

**Files:**
- Modify: `frontend/src/pages/admin/AdminTournament.tsx`

- [ ] **Step 1: Add conflict resolution modal**

After the existing fullscreen photo `<Modal>` (around line 694-716) and before the closing `</Stack>` of DraftsTab, add the conflict resolution modal:

```tsx
<Modal
  opened={resolveState !== null}
  onClose={() => setResolveState(null)}
  title="Konflikt lösen"
>
  {resolveState && (
    <Stack>
      <Text>
        <strong>{resolveState.match.player1_username}</strong> vs.{" "}
        <strong>{resolveState.match.player2_username ?? "—"}</strong>
      </Text>
      {resolveState.match.p1_reported_p1_wins !== null && (
        <Text size="sm" c="dimmed">
          Gemeldet von Sp.1: {resolveState.match.p1_reported_p1_wins} –{" "}
          {resolveState.match.p1_reported_p2_wins}
        </Text>
      )}
      {resolveState.match.p2_reported_p1_wins !== null && (
        <Text size="sm" c="dimmed">
          Gemeldet von Sp.2: {resolveState.match.p2_reported_p1_wins} –{" "}
          {resolveState.match.p2_reported_p2_wins}
        </Text>
      )}
      <NumberInput
        label={`Siege ${resolveState.match.player1_username}`}
        value={resolveState.p1Wins}
        onChange={(v) =>
          setResolveState((s) => (s ? { ...s, p1Wins: Number(v) } : s))
        }
        min={0}
        max={3}
      />
      <NumberInput
        label={`Siege ${resolveState.match.player2_username ?? "Spieler 2"}`}
        value={resolveState.p2Wins}
        onChange={(v) =>
          setResolveState((s) => (s ? { ...s, p2Wins: Number(v) } : s))
        }
        min={0}
        max={3}
      />
      <Button onClick={resolveMatch} loading={resolving} color="red">
        Ergebnis festlegen
      </Button>
    </Stack>
  )}
</Modal>
```

- [ ] **Step 2: Replace the "Pairings generieren" button with a unified progress + action row**

Currently the "Pairings generieren" button sits in the draft title bar. Replace it with a smarter action row that appears below the pods. Find the current button (inside `<Group justify="space-between" align="center">`) and remove it from the title bar.

Then, after the `</SimpleGrid>` for pods and before the simulate buttons, add:

```tsx
{/* Matches progress + next round action */}
{(() => {
  const allMatches = matchesByDraft[draft.id] ?? [];
  const hasMatches = allMatches.length > 0;
  const openMatches = allMatches.filter((m) => !m.reported && !m.is_bye);
  const conflicts = allMatches.filter((m) => m.has_conflict);
  const allReported = hasMatches && openMatches.length === 0 && conflicts.length === 0;
  const currentSwissRound = hasMatches ? Math.max(...allMatches.map((m) => m.swiss_round)) : 0;

  return (
    <Group justify="space-between" align="center">
      {hasMatches && (
        <Group gap="xs">
          <Text size="sm" c="dimmed">
            {allMatches.filter((m) => m.reported).length}/{allMatches.length} Matches gemeldet
          </Text>
          {conflicts.length > 0 && (
            <Badge color="red" size="xs">{conflicts.length} Konflikte</Badge>
          )}
        </Group>
      )}
      <Group gap="xs">
        {!hasMatches && draft.status !== "FINISHED" && (
          <Button
            size="xs"
            variant="light"
            loading={pairingFor === draft.id}
            onClick={() => generatePairings(draft.id)}
          >
            Pairings generieren
          </Button>
        )}
        {hasMatches && allReported && currentSwissRound < 3 && draft.status !== "FINISHED" && (
          <Button
            size="xs"
            variant="light"
            loading={pairingFor === draft.id}
            onClick={() => generatePairings(draft.id)}
          >
            Nächste Swiss-Runde
          </Button>
        )}
      </Group>
    </Group>
  );
})()}
```

- [ ] **Step 3: Verify build compiles**

```bash
cd /Users/christoph/git/COBS/frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/AdminTournament.tsx
git commit -m "feat: add conflict resolution modal and match progress with next round button"
```

---

### Task 4: Make simulate buttons contextual

**Files:**
- Modify: `frontend/src/pages/admin/AdminTournament.tsx`

- [ ] **Step 1: Replace static simulate buttons block with contextual buttons**

Find the current simulate buttons block (the `{isTest && draft.status !== "FINISHED" && (` section). Replace it with contextual logic:

```tsx
{isTest && draft.status !== "FINISHED" && (() => {
  const allMatches = matchesByDraft[draft.id] ?? [];
  const hasMatches = allMatches.length > 0;
  const hasOpenMatches = allMatches.some((m) => !m.reported && !m.is_bye);
  const ps = photoStatus[draft.id];
  const hasPhotoGaps = ps && (ps.pool_deck_ready < ps.total_players || ps.returned_ready < ps.total_players);

  return (
    <Group gap="xs">
      {hasOpenMatches && (
        <>
          <Button size="xs" variant="light" color="green" loading={simulating === "results"} onClick={() => simulateResults(false)}>
            Ergebnisse simulieren
          </Button>
          <Button size="xs" variant="light" color="red" loading={simulating === "conflicts"} onClick={() => simulateResults(true)}>
            Ergebnisse + Konflikte
          </Button>
        </>
      )}
      {hasPhotoGaps && (
        <>
          <Button size="xs" variant="light" color="blue" loading={simulating === "photos"} onClick={() => simulatePhotos(false)}>
            Fotos simulieren
          </Button>
          <Button size="xs" variant="light" color="orange" loading={simulating === "photos-incomplete"} onClick={() => simulatePhotos(true)}>
            Fotos (lückenhaft)
          </Button>
        </>
      )}
      {!hasMatches && !hasPhotoGaps && (
        <>
          <Button size="xs" variant="light" color="blue" loading={simulating === "photos"} onClick={() => simulatePhotos(false)}>
            Fotos simulieren
          </Button>
          <Button size="xs" variant="light" color="orange" loading={simulating === "photos-incomplete"} onClick={() => simulatePhotos(true)}>
            Fotos (lückenhaft)
          </Button>
        </>
      )}
    </Group>
  );
})()}
```

- [ ] **Step 2: Verify build compiles**

```bash
cd /Users/christoph/git/COBS/frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/AdminTournament.tsx
git commit -m "feat: make simulate buttons contextual based on match and photo state"
```

---

### Task 5: Remove MatchesTab and rename Drafts to Runden

**Files:**
- Modify: `frontend/src/pages/admin/AdminTournament.tsx`

- [ ] **Step 1: Remove the MatchesTab component**

Delete the entire `ResolveState` interface (line ~722-728) and `MatchesTab` function (line ~730-955). This is approximately 230 lines of code.

- [ ] **Step 2: Remove the Matches tab entry and panel**

In the main `AdminTournament` component, find and remove:

```tsx
<Tabs.Tab value="matches" leftSection={<IconSwords size={16} />}>
  Matches
</Tabs.Tab>
```

and:

```tsx
<Tabs.Panel value="matches">
  <MatchesTab tournamentId={id} />
</Tabs.Panel>
```

- [ ] **Step 3: Rename the Drafts tab to Runden**

Change:
```tsx
<Tabs.Tab value="drafts" leftSection={<IconCards size={16} />}>
  Drafts
</Tabs.Tab>
```

To:
```tsx
<Tabs.Tab value="drafts" leftSection={<IconCards size={16} />}>
  Runden
</Tabs.Tab>
```

- [ ] **Step 4: Clean up unused imports**

Remove `IconSwords` from the tabler icons import if it's no longer used anywhere. Also remove `Select` and `ScrollArea` from the Mantine imports if they are no longer used (check by searching for usage — `Select` is still used in OverviewTab, `ScrollArea` is used in CubesTab and PlayersTab).

Check: `IconSwords` — search the file. If only used in the removed Matches tab header, remove it.

- [ ] **Step 5: Verify build compiles**

```bash
cd /Users/christoph/git/COBS/frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/AdminTournament.tsx
git commit -m "feat: remove MatchesTab, rename Drafts tab to Runden"
```

---

### Task 6: Change pod layout from 2-column grid to full-width stack

**Files:**
- Modify: `frontend/src/pages/admin/AdminTournament.tsx`

With matches inside the pod cards, the 2-column `SimpleGrid` becomes too narrow. Switch to full-width stacked pods.

- [ ] **Step 1: Replace SimpleGrid with Stack**

Find:
```tsx
<SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
```

Replace with:
```tsx
<Stack gap="md">
```

And the closing `</SimpleGrid>` with `</Stack>`.

- [ ] **Step 2: Verify build compiles**

```bash
cd /Users/christoph/git/COBS/frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/AdminTournament.tsx
git commit -m "feat: change pod layout to full-width for match display"
```

---

### Task 7: Visual verification in browser

**Files:** No changes — verification only.

- [ ] **Step 1: Rebuild frontend container**

```bash
docker compose up -d --build frontend
```

- [ ] **Step 2: Create test tournament and verify the full flow**

1. Login as admin
2. Create test tournament (4 players, 2 cubes)
3. Navigate to tournament → "Runden" tab (verify renamed)
4. Verify "Matches" tab is gone
5. Generate draft → see pod cards
6. Simulate photos → see photo icons update
7. Generate pairings → see matches appear inside pod cards as Swiss accordion
8. Simulate results → see match results update inline
9. Simulate with conflicts → see "Lösen" buttons in match rows
10. Resolve conflict → verify modal works
11. Generate next Swiss round → see new accordion item, old one collapsed
12. Verify simulate buttons appear/disappear contextually
