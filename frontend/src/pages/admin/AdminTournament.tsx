import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Container,
  Title,
  Tabs,
  Table,
  Badge,
  Button,
  Group,
  Stack,
  Select,
  Text,
  Modal,
  NumberInput,
  Alert,
  Loader,
  Center,
  Code,
  ScrollArea,
  Divider,
} from "@mantine/core";
import {
  IconInfoCircle,
  IconCube,
  IconUsers,
  IconCards,
  IconSwords,
  IconClock,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { useApi } from "../../hooks/useApi";
import { apiFetch } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import type { TournamentDetail, Draft, Match, Pod } from "../../api/types";

const STATUS_COLORS: Record<string, string> = {
  SETUP: "gray",
  VOTING: "blue",
  DRAFTING: "orange",
  FINISHED: "green",
};

const DRAFT_STATUS_COLORS: Record<string, string> = {
  PENDING: "gray",
  ACTIVE: "orange",
  FINISHED: "green",
};

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({
  tournament,
  onRefetch,
}: {
  tournament: TournamentDetail;
  onRefetch: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeStatus = async (status: string | null) => {
    if (!status) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/tournaments/${tournament.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      onRefetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="md" maw={480}>
      {error && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />}>
          {error}
        </Alert>
      )}
      <Table>
        <Table.Tbody>
          <Table.Tr>
            <Table.Td fw={500} w={160}>
              Name
            </Table.Td>
            <Table.Td>{tournament.name}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td fw={500}>Status</Table.Td>
            <Table.Td>
              <Group gap="sm">
                <Badge color={STATUS_COLORS[tournament.status]}>
                  {tournament.status}
                </Badge>
                <Select
                  size="xs"
                  w={140}
                  value={tournament.status}
                  onChange={changeStatus}
                  disabled={saving}
                  data={[
                    { value: "SETUP", label: "SETUP" },
                    { value: "VOTING", label: "VOTING" },
                    { value: "DRAFTING", label: "DRAFTING" },
                    { value: "FINISHED", label: "FINISHED" },
                  ]}
                />
              </Group>
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td fw={500}>Join-Code</Table.Td>
            <Table.Td>
              <Code>{tournament.join_code}</Code>
            </Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td fw={500}>Max Rounds</Table.Td>
            <Table.Td>{tournament.max_rounds}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td fw={500}>Spieler</Table.Td>
            <Table.Td>{tournament.player_count}</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td fw={500}>Cubes</Table.Td>
            <Table.Td>{tournament.cube_count}</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

// ─── Cubes Tab ────────────────────────────────────────────────────────────────

function CubesTab({ tournament }: { tournament: TournamentDetail }) {
  if (tournament.cubes.length === 0) {
    return <Text c="dimmed">Keine Cubes in diesem Turnier.</Text>;
  }

  return (
    <ScrollArea>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Beschreibung</Table.Th>
            <Table.Th ta="right">Max. Spieler</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tournament.cubes.map((c) => (
            <Table.Tr key={c.id}>
              <Table.Td fw={500}>{c.cube_name}</Table.Td>
              <Table.Td c="dimmed" maw={400}>
                {c.cube_description || "—"}
              </Table.Td>
              <Table.Td ta="right">{c.max_players ?? "—"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}

// ─── Players Tab ──────────────────────────────────────────────────────────────

function PlayersTab({
  tournament,
  onRefetch,
}: {
  tournament: TournamentDetail;
  onRefetch: () => void;
}) {
  const { token, setToken } = useAuth();
  const navigate = useNavigate();
  const [dropping, setDropping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dropPlayer = async (playerId: string) => {
    setDropping(playerId);
    setError(null);
    try {
      await apiFetch(`/tournaments/${tournament.id}/players/${playerId}/drop`, {
        method: "POST",
      });
      onRefetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setDropping(null);
    }
  };

  const impersonate = async (userId: string) => {
    try {
      const res = await apiFetch<{ access_token: string }>("/auth/impersonate", {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      });
      // Save admin token so impersonation can be ended
      if (token) {
        localStorage.setItem("admin_token", token);
      }
      setToken(res.access_token);
      navigate("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impersonation failed");
    }
  };

  return (
    <Stack gap="sm">
      {error && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />}>
          {error}
        </Alert>
      )}
      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Spieler</Table.Th>
              <Table.Th ta="right">Punkte</Table.Th>
              <Table.Th ta="right">W</Table.Th>
              <Table.Th ta="right">L</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tournament.players.map((p) => (
              <Table.Tr key={p.id} opacity={p.dropped ? 0.5 : 1}>
                <Table.Td fw={500}>{p.username}</Table.Td>
                <Table.Td ta="right">{p.match_points}</Table.Td>
                <Table.Td ta="right">{p.game_wins}</Table.Td>
                <Table.Td ta="right">{p.game_losses}</Table.Td>
                <Table.Td>
                  {p.dropped ? (
                    <Badge color="red" size="xs">
                      Dropped
                    </Badge>
                  ) : (
                    <Badge color="green" size="xs">
                      Aktiv
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end">
                    <Button
                      size="xs"
                      variant="subtle"
                      color="blue"
                      onClick={() => impersonate(p.user_id)}
                    >
                      Impersonate
                    </Button>
                    {!p.dropped && (
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        loading={dropping === p.id}
                        onClick={() => dropPlayer(p.id)}
                      >
                        Drop
                      </Button>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}

// ─── Drafts Tab ───────────────────────────────────────────────────────────────

function DraftsTab({ tournamentId }: { tournamentId: string }) {
  const { data: drafts, loading, refetch } = useApi<Draft[]>(
    `/tournaments/${tournamentId}/drafts`
  );
  const [generating, setGenerating] = useState(false);
  const [pairingFor, setPairingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateDraft = async () => {
    setGenerating(true);
    setError(null);
    try {
      await apiFetch(`/tournaments/${tournamentId}/drafts`, { method: "POST" });
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setGenerating(false);
    }
  };

  const generatePairings = async (draftId: string) => {
    setPairingFor(draftId);
    setError(null);
    try {
      await apiFetch(
        `/tournaments/${tournamentId}/drafts/${draftId}/pairings`,
        { method: "POST" }
      );
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setPairingFor(null);
    }
  };

  if (loading) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  return (
    <Stack gap="md">
      {error && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />}>
          {error}
        </Alert>
      )}

      <Group>
        <Button onClick={generateDraft} loading={generating}>
          Draft generieren
        </Button>
      </Group>

      {drafts && drafts.length === 0 && (
        <Text c="dimmed">Noch keine Drafts.</Text>
      )}

      {drafts?.map((draft) => (
        <Stack key={draft.id} gap="xs">
          <Group justify="space-between">
            <Group gap="sm">
              <Text fw={600}>Runde {draft.round_number}</Text>
              <Badge color={DRAFT_STATUS_COLORS[draft.status]}>
                {draft.status}
              </Badge>
            </Group>
            {draft.status !== "FINISHED" && (
              <Button
                size="xs"
                variant="light"
                loading={pairingFor === draft.id}
                onClick={() => generatePairings(draft.id)}
              >
                Pairings generieren
              </Button>
            )}
          </Group>

          {draft.pods.length > 0 && (
            <ScrollArea>
              <Table striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Pod</Table.Th>
                    <Table.Th>Cube</Table.Th>
                    <Table.Th ta="right">Größe</Table.Th>
                    <Table.Th>Spieler</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {draft.pods.map((pod) => (
                    <Table.Tr key={pod.id}>
                      <Table.Td>{pod.pod_number}</Table.Td>
                      <Table.Td>{pod.cube_name}</Table.Td>
                      <Table.Td ta="right">{pod.pod_size}</Table.Td>
                      <Table.Td>
                        {pod.players
                          .sort((a, b) => a.seat_number - b.seat_number)
                          .map((p) => p.username)
                          .join(", ")}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
          <Divider />
        </Stack>
      ))}
    </Stack>
  );
}

// ─── Matches Tab ──────────────────────────────────────────────────────────────

interface ResolveState {
  match: Match;
  draftId: string;
  p1Wins: number;
  p2Wins: number;
}

function MatchesTab({ tournamentId }: { tournamentId: string }) {
  const { data: drafts, loading: draftsLoading } = useApi<Draft[]>(
    `/tournaments/${tournamentId}/drafts`
  );

  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [resolveState, setResolveState] = useState<ResolveState | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick the first draft by default when drafts load
  const activeDraftId =
    selectedDraftId ??
    (drafts && drafts.length > 0 ? drafts[drafts.length - 1].id : null);

  const { data: matches, loading: matchesLoading, refetch: refetchMatches } =
    useApi<Match[]>(
      activeDraftId
        ? `/tournaments/${tournamentId}/drafts/${activeDraftId}/matches`
        : null
    );

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
      refetchMatches();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setResolving(false);
    }
  };

  if (draftsLoading) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  if (!drafts || drafts.length === 0) {
    return <Text c="dimmed">Noch keine Drafts.</Text>;
  }

  const draftOptions = drafts.map((d) => ({
    value: d.id,
    label: `Runde ${d.round_number} (${d.status})`,
  }));

  return (
    <Stack gap="md">
      {error && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />}>
          {error}
        </Alert>
      )}

      <Select
        w={280}
        label="Draft"
        value={activeDraftId}
        onChange={(v) => setSelectedDraftId(v)}
        data={draftOptions}
      />

      {matchesLoading && (
        <Center>
          <Loader />
        </Center>
      )}

      {matches && matches.length === 0 && (
        <Text c="dimmed">Keine Matches in diesem Draft.</Text>
      )}

      {matches && matches.length > 0 && (
        <ScrollArea>
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th ta="right">Rd</Table.Th>
                <Table.Th>Spieler 1</Table.Th>
                <Table.Th ta="center">Ergebnis</Table.Th>
                <Table.Th>Spieler 2</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {matches.map((m) => (
                <Table.Tr key={m.id}>
                  <Table.Td ta="right">{m.swiss_round}</Table.Td>
                  <Table.Td fw={500}>{m.player1_username}</Table.Td>
                  <Table.Td ta="center">
                    {m.reported ? (
                      <Text fw={600}>
                        {m.player1_wins} – {m.player2_wins}
                      </Text>
                    ) : m.is_bye ? (
                      <Text c="dimmed">BYE</Text>
                    ) : (
                      <Text c="dimmed">–</Text>
                    )}
                  </Table.Td>
                  <Table.Td>{m.player2_username ?? "—"}</Table.Td>
                  <Table.Td>
                    {m.is_bye ? (
                      <Badge color="gray" size="xs">
                        Bye
                      </Badge>
                    ) : m.has_conflict ? (
                      <Badge color="red" size="xs">
                        Konflikt
                      </Badge>
                    ) : m.reported ? (
                      <Badge color="green" size="xs">
                        Fertig
                      </Badge>
                    ) : (
                      <Badge color="gray" size="xs">
                        Offen
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {m.has_conflict && activeDraftId && (
                      <Button
                        size="xs"
                        color="red"
                        variant="light"
                        onClick={() =>
                          setResolveState({
                            match: m,
                            draftId: activeDraftId,
                            p1Wins: m.p1_reported_p1_wins ?? 0,
                            p2Wins: m.p1_reported_p2_wins ?? 0,
                          })
                        }
                      >
                        Lösen
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}

      {/* Resolve Conflict Modal */}
      <Modal
        opened={resolveState !== null}
        onClose={() => setResolveState(null)}
        title="Konflikt lösen"
      >
        {resolveState && (
          <Stack>
            <Text>
              <strong>{resolveState.match.player1_username}</strong> vs.{" "}
              <strong>
                {resolveState.match.player2_username ?? "—"}
              </strong>
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
                setResolveState((s) =>
                  s ? { ...s, p1Wins: Number(v) } : s
                )
              }
              min={0}
              max={3}
            />
            <NumberInput
              label={`Siege ${resolveState.match.player2_username ?? "Spieler 2"}`}
              value={resolveState.p2Wins}
              onChange={(v) =>
                setResolveState((s) =>
                  s ? { ...s, p2Wins: Number(v) } : s
                )
              }
              min={0}
              max={3}
            />
            {error && (
              <Alert color="red" icon={<IconAlertTriangle size={16} />}>
                {error}
              </Alert>
            )}
            <Button onClick={resolveMatch} loading={resolving} color="red">
              Ergebnis festlegen
            </Button>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

// ─── Timer Tab ────────────────────────────────────────────────────────────────

function TimerTab({ tournamentId }: { tournamentId: string }) {
  const { data: drafts, loading } = useApi<Draft[]>(
    `/tournaments/${tournamentId}/drafts`
  );

  const [timerMinutes, setTimerMinutes] = useState<Record<string, number>>({});
  const [settingFor, setSettingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setTimer = async (pod: Pod) => {
    const minutes = timerMinutes[pod.id] ?? 50;
    setSettingFor(pod.id);
    setError(null);
    try {
      await apiFetch(`/tournaments/${tournamentId}/pods/${pod.id}/timer`, {
        method: "POST",
        body: JSON.stringify({ duration_seconds: minutes * 60 }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSettingFor(null);
    }
  };

  if (loading) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  // Show pods from the latest draft
  const latestDraft =
    drafts && drafts.length > 0 ? drafts[drafts.length - 1] : null;

  if (!latestDraft || latestDraft.pods.length === 0) {
    return <Text c="dimmed">Noch keine Pods vorhanden.</Text>;
  }

  return (
    <Stack gap="md">
      {error && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />}>
          {error}
        </Alert>
      )}
      <Text fw={500}>
        Runde {latestDraft.round_number} — Timer setzen
      </Text>
      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Pod</Table.Th>
            <Table.Th>Cube</Table.Th>
            <Table.Th ta="right">Spieler</Table.Th>
            <Table.Th>Timer aktiv bis</Table.Th>
            <Table.Th ta="right">Minuten</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {latestDraft.pods.map((pod) => {
            const timerActive =
              pod.timer_ends_at && new Date(pod.timer_ends_at) > new Date();
            return (
              <Table.Tr key={pod.id}>
                <Table.Td>{pod.pod_number}</Table.Td>
                <Table.Td>{pod.cube_name}</Table.Td>
                <Table.Td ta="right">{pod.pod_size}</Table.Td>
                <Table.Td>
                  {pod.timer_ends_at ? (
                    <Text
                      size="sm"
                      c={timerActive ? "green" : "dimmed"}
                    >
                      {new Date(pod.timer_ends_at).toLocaleTimeString("de-DE", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {timerActive ? " (aktiv)" : " (abgelaufen)"}
                    </Text>
                  ) : (
                    <Text size="sm" c="dimmed">
                      —
                    </Text>
                  )}
                </Table.Td>
                <Table.Td ta="right">
                  <NumberInput
                    w={90}
                    size="xs"
                    value={timerMinutes[pod.id] ?? 50}
                    onChange={(v) =>
                      setTimerMinutes((prev) => ({
                        ...prev,
                        [pod.id]: Number(v),
                      }))
                    }
                    min={1}
                    max={999}
                  />
                </Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    loading={settingFor === pod.id}
                    onClick={() => setTimer(pod)}
                  >
                    Setzen
                  </Button>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AdminTournament() {
  const { id } = useParams<{ id: string }>();
  const { data: tournament, loading, refetch } = useApi<TournamentDetail>(
    id ? `/tournaments/${id}` : null
  );

  if (loading) {
    return (
      <Center mt="xl">
        <Loader />
      </Center>
    );
  }

  if (!tournament || !id) {
    return (
      <Container>
        <Alert color="red" icon={<IconAlertTriangle size={16} />}>
          Turnier nicht gefunden.
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="xl">
      <Group mb="lg" gap="sm" align="baseline">
        <Title order={2}>{tournament.name}</Title>
        <Badge color={STATUS_COLORS[tournament.status]}>{tournament.status}</Badge>
      </Group>

      <Tabs defaultValue="overview" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="overview" leftSection={<IconInfoCircle size={16} />}>
            Übersicht
          </Tabs.Tab>
          <Tabs.Tab value="cubes" leftSection={<IconCube size={16} />}>
            Cubes
          </Tabs.Tab>
          <Tabs.Tab value="players" leftSection={<IconUsers size={16} />}>
            Spieler ({tournament.player_count})
          </Tabs.Tab>
          <Tabs.Tab value="drafts" leftSection={<IconCards size={16} />}>
            Drafts
          </Tabs.Tab>
          <Tabs.Tab value="matches" leftSection={<IconSwords size={16} />}>
            Matches
          </Tabs.Tab>
          <Tabs.Tab value="timer" leftSection={<IconClock size={16} />}>
            Timer
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview">
          <OverviewTab tournament={tournament} onRefetch={refetch} />
        </Tabs.Panel>

        <Tabs.Panel value="cubes">
          <CubesTab tournament={tournament} />
        </Tabs.Panel>

        <Tabs.Panel value="players">
          <PlayersTab tournament={tournament} onRefetch={refetch} />
        </Tabs.Panel>

        <Tabs.Panel value="drafts">
          <DraftsTab tournamentId={id} />
        </Tabs.Panel>

        <Tabs.Panel value="matches">
          <MatchesTab tournamentId={id} />
        </Tabs.Panel>

        <Tabs.Panel value="timer">
          <TimerTab tournamentId={id} />
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}
