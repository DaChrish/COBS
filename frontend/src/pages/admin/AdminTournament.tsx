import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ActionIcon,
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
  SimpleGrid,
  Paper,
  Image as MantineImage,
  Accordion,
  TextInput,
  Popover,
  Tooltip,
} from "@mantine/core";
import {
  IconInfoCircle,
  IconCube,
  IconUsers,
  IconCards,
  IconClock,
  IconAlertTriangle,
  IconCamera,
  IconCameraOff,
  IconDownload,
  IconMaximize,
  IconTrophy,
  IconPlus,
  IconTrash,
  IconCopy,
} from "@tabler/icons-react";
import { useApi } from "../../hooks/useApi";
import { apiFetch } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import type { TournamentDetail, Draft, Match, Pod, DraftPhotoStatus, PlayerPhotoStatus, StandingsEntry, Cube, CubeVoteSummary } from "../../api/types";

function downloadPdf(path: string, filename: string) {
  const token = localStorage.getItem("token");
  fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch((e) => alert(e.message));
}

function translateError(msg: string): string {
  if (msg.toLowerCase().includes("missing pool/deck photo")) {
    const match = msg.match(/(\d+) player/);
    const count = match ? match[1] : "einigen";
    return `POOL/DECK Fotos fehlen bei ${count} Spieler(n). Bitte Fotos hochladen lassen.`;
  }
  if (msg.toLowerCase().includes("missing returned photo")) {
    const match = msg.match(/(\d+) player/);
    const count = match ? match[1] : "einigen";
    return `RETURNED Fotos fehlen bei ${count} Spieler(n) der vorherigen Runde.`;
  }
  if (msg.toLowerCase().includes("unreported match")) {
    return "Es gibt noch offene Matches in diesem Pod.";
  }
  if (msg.toLowerCase().includes("unresolved match conflict")) {
    return "Es gibt ungelöste Konflikte in diesem Pod.";
  }
  if (msg.toLowerCase().includes("max 3 swiss rounds")) {
    return "Maximale Anzahl Swiss-Runden (3) erreicht.";
  }
  return msg;
}

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
              <Group gap="xs">
                <Code style={{ fontSize: 16 }}>{tournament.join_code}</Code>
                <ActionIcon size="xs" variant="subtle"
                  onClick={() => navigator.clipboard.writeText(tournament.join_code)}>
                  <IconCopy size={14} />
                </ActionIcon>
              </Group>
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

function CubesTab({ tournament, onRefetch }: { tournament: TournamentDetail; onRefetch: () => void }) {
  const { data: allCubes, refetch: refetchCubes } = useApi<Cube[]>("/cubes");
  const { data: voteSummary } = useApi<CubeVoteSummary[]>(`/tournaments/${tournament.id}/votes/summary`);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create-modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newMaxPlayers, setNewMaxPlayers] = useState<number | string>("");
  const [saving, setSaving] = useState(false);

  const tournamentCubeIds = tournament.cubes.map((c) => c.cube_id);
  const availableCubes = allCubes?.filter((c) => !tournamentCubeIds.includes(c.id)) ?? [];

  const addCube = async (cubeId: string) => {
    setAdding(true);
    setError(null);
    try {
      await apiFetch(`/tournaments/${tournament.id}/cubes`, {
        method: "POST",
        body: JSON.stringify({ cube_id: cubeId }),
      });
      onRefetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Hinzufügen");
    } finally {
      setAdding(false);
    }
  };

  const removeCube = async (cubeId: string) => {
    setRemoving(cubeId);
    setError(null);
    try {
      await apiFetch(`/tournaments/${tournament.id}/cubes/${cubeId}`, {
        method: "DELETE",
      });
      onRefetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Entfernen");
    } finally {
      setRemoving(null);
    }
  };

  const createAndAdd = async () => {
    setSaving(true);
    setError(null);
    try {
      const cube = await apiFetch<Cube>("/cubes", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim(),
          max_players: newMaxPlayers === "" ? null : Number(newMaxPlayers),
        }),
      });
      await apiFetch(`/tournaments/${tournament.id}/cubes`, {
        method: "POST",
        body: JSON.stringify({ cube_id: cube.id }),
      });
      refetchCubes();
      onRefetch();
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
      setNewMaxPlayers("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Erstellen");
    } finally {
      setSaving(false);
    }
  };

  const renderDescription = (desc: string | null) => {
    if (!desc) return "—";
    if (desc.startsWith("http")) {
      return (
        <a href={desc} target="_blank" rel="noopener noreferrer">
          {desc}
        </a>
      );
    }
    return desc;
  };

  return (
    <Stack>
      {error && (
        <Alert color="red" variant="light" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Group>
        <Select
          placeholder="Cube hinzufügen..."
          data={availableCubes.map((c) => ({ value: c.id, label: `${c.name}${c.max_players ? ` (max ${c.max_players})` : ""}` }))}
          searchable
          disabled={adding}
          value={null}
          onChange={(v) => { if (v) addCube(v); }}
          style={{ flex: 1 }}
        />
        <Button leftSection={<IconPlus size={16} />} variant="light" onClick={() => setCreateOpen(true)}>
          Neuer Cube
        </Button>
      </Group>

      {tournament.cubes.length === 0 ? (
        <Text c="dimmed">Keine Cubes in diesem Turnier.</Text>
      ) : (
        <ScrollArea>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Beschreibung</Table.Th>
                <Table.Th ta="right">Max. Spieler</Table.Th>
                <Table.Th>Votes</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tournament.cubes.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td fw={500}>{c.cube_name}</Table.Td>
                  <Table.Td c="dimmed" maw={400}>
                    {renderDescription(c.cube_description)}
                  </Table.Td>
                  <Table.Td ta="right">{c.max_players ?? "—"}</Table.Td>
                  <Table.Td>
                    {(() => {
                      const vs = voteSummary?.find((v) => v.tournament_cube_id === c.id);
                      if (!vs || (vs.desired === 0 && vs.neutral === 0 && vs.avoid === 0)) return "—";
                      return (
                        <Popover width={250} position="bottom" withArrow>
                          <Popover.Target>
                            <Group gap={4} style={{ cursor: "pointer" }}>
                              {vs.desired > 0 && <Badge size="xs" color="green" variant="light">{vs.desired}</Badge>}
                              {vs.neutral > 0 && <Badge size="xs" color="gray" variant="light">{vs.neutral}</Badge>}
                              {vs.avoid > 0 && <Badge size="xs" color="red" variant="light">{vs.avoid}</Badge>}
                            </Group>
                          </Popover.Target>
                          <Popover.Dropdown>
                            <Stack gap={2}>
                              <Text size="xs" fw={600} c="dimmed">{vs.cube_name} — Votes</Text>
                              {vs.votes.map((v, i) => (
                                <Group key={i} justify="space-between">
                                  <Text size="xs">{v.username}</Text>
                                  <Badge size="xs" color={v.vote === "DESIRED" ? "green" : v.vote === "AVOID" ? "red" : "gray"} variant="light">
                                    {v.vote}
                                  </Badge>
                                </Group>
                              ))}
                            </Stack>
                          </Popover.Dropdown>
                        </Popover>
                      );
                    })()}
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      loading={removing === c.cube_id}
                      onClick={() => removeCube(c.cube_id)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Neuen Cube erstellen">
        <Stack>
          <TextInput label="Name" required value={newName} onChange={(e) => setNewName(e.currentTarget.value)} />
          <TextInput label="Beschreibung" value={newDescription} onChange={(e) => setNewDescription(e.currentTarget.value)} />
          <NumberInput label="Max. Spieler" value={newMaxPlayers} onChange={setNewMaxPlayers} min={2} />
          <Button loading={saving} disabled={!newName.trim()} onClick={createAndAdd}>
            Erstellen & hinzufügen
          </Button>
        </Stack>
      </Modal>
    </Stack>
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
  const { data: voteSummary } = useApi<CubeVoteSummary[]>(`/tournaments/${tournament.id}/votes/summary`);

  const playerVotes = useMemo(() => {
    if (!voteSummary) return {};
    const map: Record<string, { desired: number; neutral: number; avoid: number }> = {};
    for (const cs of voteSummary) {
      for (const v of cs.votes) {
        if (!map[v.username]) map[v.username] = { desired: 0, neutral: 0, avoid: 0 };
        if (v.vote === "DESIRED") map[v.username].desired++;
        else if (v.vote === "NEUTRAL") map[v.username].neutral++;
        else if (v.vote === "AVOID") map[v.username].avoid++;
      }
    }
    return map;
  }, [voteSummary]);

  const dropPlayer = async (playerId: string) => {
    setDropping(playerId);
    setError(null);
    try {
      await apiFetch(`/tournaments/${tournament.id}/players/${playerId}/drop`, {
        method: "PATCH",
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
      await setToken(res.access_token);
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
              <Table.Th>Votes</Table.Th>
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
                  {(() => {
                    const pv = playerVotes[p.username];
                    if (!pv) return "—";
                    return (
                      <Group gap={4}>
                        {pv.desired > 0 && <Badge size="xs" color="green" variant="light">{pv.desired}D</Badge>}
                        {pv.neutral > 0 && <Badge size="xs" color="gray" variant="light">{pv.neutral}N</Badge>}
                        {pv.avoid > 0 && <Badge size="xs" color="red" variant="light">{pv.avoid}A</Badge>}
                      </Group>
                    );
                  })()}
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

const POD_ACCENT_COLORS = [
  "blue",
  "teal",
  "violet",
  "orange",
  "pink",
  "cyan",
  "grape",
  "lime",
] as const;

function DraftsTab({ tournamentId, isTest, tournament }: { tournamentId: string; isTest: boolean; tournament: TournamentDetail }) {
  const { token, setToken } = useAuth();
  const navigate = useNavigate();
  const { data: drafts, loading, refetch } = useApi<Draft[]>(
    `/tournaments/${tournamentId}/drafts`
  );
  const [generating, setGenerating] = useState(false);
  const [pairingFor, setPairingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simulating, setSimulating] = useState<string | null>(null);
  const [photoStatus, setPhotoStatus] = useState<Record<string, DraftPhotoStatus>>({});
  const [selectedPlayer, setSelectedPlayer] = useState<{ player: PlayerPhotoStatus; draftId: string } | null>(null);
  const [forceOverride, setForceOverride] = useState<{ type: string; draftId: string | null; podId?: string } | null>(null);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);
  const [timerMinutes, setTimerMinutes] = useState<Record<string, number>>({});
  const [settingTimer, setSettingTimer] = useState<string | null>(null);

  const [confirmCancelTimer, setConfirmCancelTimer] = useState<Pod | null>(null);
  const { data: voteSummary } = useApi<CubeVoteSummary[]>(`/tournaments/${tournamentId}/votes/summary`);

  const playerAllVotes = useMemo(() => {
    if (!voteSummary) return {};
    const map: Record<string, { cube: string; vote: string }[]> = {};
    for (const cs of voteSummary) {
      for (const v of cs.votes) {
        if (!map[v.username]) map[v.username] = [];
        map[v.username].push({ cube: cs.cube_name, vote: v.vote });
      }
    }
    return map;
  }, [voteSummary]);

  const setTimerForAllPods = async (draftPods: Pod[], minutes: number) => {
    setSettingTimer("all");
    setError(null);
    try {
      for (const pod of draftPods) {
        await apiFetch(`/tournaments/${tournamentId}/pods/${pod.id}/timer`, {
          method: "POST",
          body: JSON.stringify({ minutes }),
        });
      }
      refetch();
    } catch (e) {
      setError(translateError(e instanceof Error ? e.message : "Error"));
    } finally {
      setSettingTimer(null);
    }
  };

  const setTimerForPod = async (pod: Pod, minutes: number) => {
    setSettingTimer(pod.id);
    try {
      await apiFetch(`/tournaments/${tournamentId}/pods/${pod.id}/timer`, {
        method: "POST",
        body: JSON.stringify({ minutes }),
      });
      refetch();
    } catch (e) {
      setError(translateError(e instanceof Error ? e.message : "Error"));
    } finally {
      setSettingTimer(null);
    }
  };

  const clearTimerForPod = async (pod: Pod) => {
    setSettingTimer(pod.id);
    try {
      await apiFetch(`/tournaments/${tournamentId}/pods/${pod.id}/timer`, {
        method: "POST",
        body: JSON.stringify({ minutes: 0 }),
      });
      refetch();
    } catch (e) {
      setError(translateError(e instanceof Error ? e.message : "Error"));
    } finally {
      setSettingTimer(null);
    }
  };
  const [matchesByDraft, setMatchesByDraft] = useState<Record<string, Match[]>>({});
  const [resolveState, setResolveState] = useState<{
    match: Match; draftId: string; p1Wins: number; p2Wins: number;
  } | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!drafts) return;
    drafts.forEach(async (draft) => {
      try {
        const status = await apiFetch<DraftPhotoStatus>(
          `/tournaments/${tournamentId}/drafts/${draft.id}/photos/status`
        );
        setPhotoStatus((prev) => ({ ...prev, [draft.id]: status }));
      } catch {
        // ignore
      }
    });
  }, [drafts, tournamentId]);

  useEffect(() => {
    if (!drafts) return;
    drafts.forEach(async (draft) => {
      try {
        const matches = await apiFetch<Match[]>(
          `/tournaments/${tournamentId}/drafts/${draft.id}/matches`
        );
        setMatchesByDraft((prev) => ({ ...prev, [draft.id]: matches }));
      } catch { /* ignore */ }
    });
  }, [drafts, tournamentId]);

  const simulateResults = async (withConflicts: boolean) => {
    setSimulating(withConflicts ? "conflicts" : "results");
    setError(null);
    try {
      await apiFetch(`/test/tournaments/${tournamentId}/simulate-results`, {
        method: "POST",
        body: JSON.stringify({ with_conflicts: withConflicts }),
      });
      refetch();
    } catch (e) {
      setError(translateError(e instanceof Error ? e.message : "Error"));
    } finally {
      setSimulating(null);
    }
  };

  const simulatePhotos = async (incomplete: boolean) => {
    setSimulating(incomplete ? "photos-incomplete" : "photos");
    setError(null);
    try {
      await apiFetch(`/test/tournaments/${tournamentId}/simulate-photos`, {
        method: "POST",
        body: JSON.stringify({ incomplete }),
      });
      refetch();
    } catch (e) {
      setError(translateError(e instanceof Error ? e.message : "Error"));
    } finally {
      setSimulating(null);
    }
  };

  const generateDraft = async (skipPhotoCheck = false) => {
    setGenerating(true);
    setError(null);
    try {
      await apiFetch(`/tournaments/${tournamentId}/drafts`, {
        method: "POST",
        body: JSON.stringify({ skip_photo_check: skipPhotoCheck }),
      });
      refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      if (msg.toLowerCase().includes("photo") && !skipPhotoCheck) {
        setError(translateError(msg));
        setForceOverride({ type: "draft", draftId: null });
      } else {
        setError(translateError(msg));
      }
    } finally {
      setGenerating(false);
    }
  };

  const generatePairings = async (draftId: string, podId: string, skipPhotoCheck = false) => {
    setPairingFor(podId);
    setError(null);
    try {
      await apiFetch(
        `/tournaments/${tournamentId}/drafts/${draftId}/pods/${podId}/pairings`,
        {
          method: "POST",
          body: JSON.stringify({ skip_photo_check: skipPhotoCheck }),
        }
      );
      refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      if (msg.toLowerCase().includes("photo") && !skipPhotoCheck) {
        setError(translateError(msg));
        setForceOverride({ type: "pairings", draftId, podId });
      } else {
        setError(translateError(msg));
      }
    } finally {
      setPairingFor(null);
    }
  };

  const resolveMatch = async () => {
    if (!resolveState) return;
    setResolving(true);
    setError(null);
    try {
      await apiFetch(
        `/tournaments/${tournamentId}/drafts/${resolveState.draftId}/matches/${resolveState.match.id}/resolve`,
        { method: "POST", body: JSON.stringify({ player1_wins: resolveState.p1Wins, player2_wins: resolveState.p2Wins }) }
      );
      setResolveState(null);
      refetch();
    } catch (e) {
      setError(translateError(e instanceof Error ? e.message : "Error"));
    } finally {
      setResolving(false);
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
    <Stack gap="lg">
      {error && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />}>
          <Group justify="space-between" align="center" wrap="nowrap">
            <Text size="sm">{error}</Text>
            {forceOverride && (
              <Button
                size="xs"
                variant="light"
                color="red"
                style={{ flexShrink: 0 }}
                onClick={() => {
                  const { type, draftId, podId } = forceOverride;
                  setForceOverride(null);
                  setError(null);
                  if (type === "pairings" && draftId && podId) {
                    generatePairings(draftId, podId, true);
                  } else if (type === "draft") {
                    generateDraft(true);
                  }
                }}
              >
                Trotzdem fortfahren
              </Button>
            )}
          </Group>
        </Alert>
      )}

      <Group>
        <Button onClick={() => generateDraft()} loading={generating}>
          Draft generieren
        </Button>
      </Group>

      {drafts && drafts.length === 0 && (
        <Text c="dimmed">Noch keine Drafts.</Text>
      )}

      {drafts && drafts.length > 0 && (
      <Accordion
        variant="separated"
        defaultValue={`draft-${Math.max(...drafts.map((d) => d.round_number))}`}
        styles={{ item: { borderRadius: 8 } }}
      >
      {[...drafts].reverse().map((draft) => {
        const allDraftMatches = matchesByDraft[draft.id] ?? [];
        const currentSwiss = allDraftMatches.length > 0 ? Math.max(...allDraftMatches.map((m) => m.swiss_round)) : 0;
        const tableNumbers: Record<string, number> = {};
        if (currentSwiss > 0) {
          let tbl = 1;
          for (const p of draft.pods) {
            const currentRoundNonByes = allDraftMatches
              .filter((m) => m.pod_id === p.id && m.swiss_round === currentSwiss && !m.is_bye);
            for (const m of currentRoundNonByes) {
              tableNumbers[m.id] = tbl++;
            }
          }
        }
        return (
        <Accordion.Item key={draft.id} value={`draft-${draft.round_number}`}>
          <Accordion.Control>
            <Group gap="sm" align="center">
              <Text fw={700} size="lg">Runde {draft.round_number}</Text>
              <Badge
                size="lg"
                variant="dot"
                color={DRAFT_STATUS_COLORS[draft.status]}
              >
                {draft.status}
              </Badge>
              {photoStatus[draft.id] && (
                <Badge
                  size="sm"
                  variant="light"
                  color={photoStatus[draft.id].pool_deck_ready === photoStatus[draft.id].total_players ? "green" : "yellow"}
                  leftSection={<IconCamera size={12} />}
                >
                  {photoStatus[draft.id].pool_deck_ready}/{photoStatus[draft.id].total_players} bereit
                </Badge>
              )}
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
          <Stack gap="md" pt="xs">
          {draft.pods.length > 0 && (
            <Stack gap="md">
              {draft.pods.map((pod, idx) => {
                const accent = POD_ACCENT_COLORS[idx % POD_ACCENT_COLORS.length];
                return (
                  <Paper
                    key={pod.id}
                    radius="md"
                    p="md"
                    withBorder
                    style={{
                      borderLeftWidth: 3,
                      borderLeftColor: `var(--mantine-color-${accent}-6)`,
                    }}
                  >
                    <Group justify="space-between" mb="xs">
                      <Group gap="xs" align="center">
                        <Text fw={700} size="sm" c={accent}>
                          Tisch {pod.pod_number}
                        </Text>
                        <Text size="xs" c="dimmed">
                          ·
                        </Text>
                        <Group gap={4} align="center">
                          <IconCube size={14} style={{ opacity: 0.6 }} />
                          <Text size="sm" fw={500}>
                            {pod.cube_name}
                          </Text>
                        </Group>
                      </Group>
                      <Group gap="xs">
                        {(() => {
                          const pts = pod.players.map((p) => p.match_points);
                          const avg = pts.length > 0 ? (pts.reduce((a, b) => a + b, 0) / pts.length).toFixed(1) : "0";
                          const min = pts.length > 0 ? Math.min(...pts) : 0;
                          const max = pts.length > 0 ? Math.max(...pts) : 0;
                          return pts.some((p) => p > 0) ? (
                            <Text size="xs" c="dimmed">Ø{avg} · {min}–{max} Pkt</Text>
                          ) : null;
                        })()}
                        <Badge size="sm" variant="light" color={accent}>
                          {pod.pod_size} Spieler
                        </Badge>
                      </Group>
                    </Group>
                    <Group gap={6} wrap="wrap">
                      {pod.players
                        .sort((a, b) => a.seat_number - b.seat_number)
                        .map((p) => {
                          const voteColor =
                            p.vote === "DESIRED"
                              ? "green"
                              : p.vote === "AVOID"
                                ? "red"
                                : "gray";
                          const ps = photoStatus[draft.id]?.players.find(
                            (s) => s.tournament_player_id === p.tournament_player_id
                          );
                          const hasPoolDeck = ps?.pool && ps?.deck;
                          return (
                            <Tooltip
                              key={p.tournament_player_id}
                              multiline
                              w={250}
                              withArrow
                              label={
                                <Stack gap={2}>
                                  {playerAllVotes[p.username]?.map((v, i) => (
                                    <Group key={i} justify="space-between" gap="xs">
                                      <Text size="xs" c={v.vote === "DESIRED" ? "green.3" : v.vote === "AVOID" ? "red.3" : "gray.5"}>
                                        {v.cube}
                                      </Text>
                                      <Text size="xs" fw={600} c={v.vote === "DESIRED" ? "green.3" : v.vote === "AVOID" ? "red.3" : "gray.5"}>
                                        {v.vote === "DESIRED" ? "✓" : v.vote === "AVOID" ? "✗" : "–"}
                                      </Text>
                                    </Group>
                                  )) || <Text size="xs">Keine Votes</Text>}
                                </Stack>
                              }
                            >
                              <Badge
                                size="sm"
                                variant={p.vote === "DESIRED" ? "light" : p.vote === "AVOID" ? "light" : "outline"}
                                color={voteColor}
                                style={{ cursor: ps ? "pointer" : undefined }}
                                onClick={() => ps && setSelectedPlayer({ player: ps, draftId: draft.id })}
                                leftSection={
                                  <Group gap={2} wrap="nowrap">
                                    <Text span size="xs" c="dimmed" fw={600}>
                                      {p.seat_number}
                                    </Text>
                                    {ps && (
                                      hasPoolDeck
                                        ? <IconCamera size={10} color="var(--mantine-color-green-6)" />
                                        : <IconCameraOff size={10} color="var(--mantine-color-red-6)" />
                                    )}
                                  </Group>
                                }
                              >
                                {p.username}{p.match_points > 0 ? ` (${p.match_points})` : ""}
                              </Badge>
                            </Tooltip>
                          );
                        })}
                    </Group>
                    {/* Timer */}
                    {draft.status === "ACTIVE" && pod.timer_ends_at && (
                      <Group gap="xs" mt="xs" align="center">
                        <IconClock size={14} style={{ opacity: 0.5 }} />
                        {new Date(pod.timer_ends_at) > new Date() ? (
                          <Text size="xs" c="green">
                            Timer bis {new Date(pod.timer_ends_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                          </Text>
                        ) : (
                          <Text size="xs" c="red">Timer abgelaufen</Text>
                        )}
                        <Button size="compact-xs" variant="subtle" color="red"
                          loading={settingTimer === pod.id}
                          onClick={() => setConfirmCancelTimer(pod)}>
                          Abbrechen
                        </Button>
                      </Group>
                    )}
                    {/* Swiss Rounds */}
                    {(() => {
                      const podMatches = matchesByDraft[draft.id]?.filter((m) => m.pod_id === pod.id) ?? [];
                      if (podMatches.length === 0) return null;
                      const swissRounds = [...new Set(podMatches.map((m) => m.swiss_round))].sort();
                      const latestRound = Math.max(...swissRounds);
                      return (
                        <Accordion variant="separated" mt="sm" key={`pod-${pod.id}-rounds-${swissRounds.length}`} defaultValue={`swiss-${latestRound}`}
                          styles={{ item: { borderRadius: 8 }, content: { padding: '4px 0' } }}>
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
                                    <Badge size="xs" variant="light" color={allDone ? "green" : "yellow"}>
                                      {reported}/{total}
                                    </Badge>
                                  </Group>
                                </Accordion.Control>
                                <Accordion.Panel>
                                  <Stack gap={4}>
                                    {roundMatches.map((m) => (
                                      <Group key={m.id} justify="space-between" px="xs" py={4}
                                        style={{ borderRadius: 4 }}
                                        bg={m.has_conflict ? "var(--mantine-color-red-light)" : undefined}>
                                        {tableNumbers[m.id] && (
                                          <Text size="xs" c="dimmed" w={24} ta="center" style={{ flexShrink: 0 }}>
                                            T{tableNumbers[m.id]}
                                          </Text>
                                        )}
                                        <Text size="sm" fw={500} style={{ flex: 1 }}>
                                          {m.player1_username}
                                          {(() => { const pts = pod.players.find((p) => p.tournament_player_id === m.player1_id)?.match_points; return pts ? <Text span size="xs" c="dimmed"> ({pts})</Text> : null; })()}
                                        </Text>
                                        <Text size="sm" fw={600} c="dimmed" ta="center" w={60}>
                                          {m.reported ? `${m.player1_wins}–${m.player2_wins}` : m.is_bye ? "BYE" : "–"}
                                        </Text>
                                        <Text size="sm" fw={500} style={{ flex: 1 }} ta="right">
                                          {m.player2_username ?? "—"}
                                          {(() => { const pts = m.player2_id ? pod.players.find((p) => p.tournament_player_id === m.player2_id)?.match_points : null; return pts ? <Text span size="xs" c="dimmed"> ({pts})</Text> : null; })()}
                                        </Text>
                                        <div style={{ width: 70, textAlign: "right" }}>
                                          {m.is_bye ? (
                                            <Badge color="gray" size="xs">Bye</Badge>
                                          ) : m.has_conflict ? (
                                            <Button size="compact-xs" color="red" variant="light"
                                              onClick={() => setResolveState({
                                                match: m, draftId: draft.id,
                                                p1Wins: m.p1_reported_p1_wins ?? 0, p2Wins: m.p1_reported_p2_wins ?? 0,
                                              })}>Lösen</Button>
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
                    {draft.status !== "FINISHED" && (() => {
                      const podMatches = matchesByDraft[draft.id]?.filter((m) => m.pod_id === pod.id) ?? [];
                      const hasPodMatches = podMatches.length > 0;
                      const openPodMatches = podMatches.filter((m) => !m.reported && !m.is_bye);
                      const podConflicts = podMatches.filter((m) => m.has_conflict);
                      const podAllReported = hasPodMatches && openPodMatches.length === 0 && podConflicts.length === 0;
                      const podSwissRound = hasPodMatches ? Math.max(...podMatches.map((m) => m.swiss_round)) : 0;

                      return (
                        <Group justify="space-between" mt="xs" align="center">
                          {hasPodMatches ? (
                            <Group gap="xs">
                              <Text size="xs" c="dimmed">
                                {podMatches.filter((m) => m.reported).length}/{podMatches.length} gemeldet
                              </Text>
                              {podConflicts.length > 0 && <Badge color="red" size="xs">{podConflicts.length} Konflikte</Badge>}
                            </Group>
                          ) : <div />}
                          <Group gap="xs">
                            {!hasPodMatches && (
                              <Button size="compact-xs" variant="light"
                                loading={pairingFor === pod.id}
                                onClick={() => generatePairings(draft.id, pod.id)}>
                                Pairings
                              </Button>
                            )}
                            {podAllReported && podSwissRound < 3 && (
                              <Button size="compact-xs" variant="light"
                                loading={pairingFor === pod.id}
                                onClick={() => generatePairings(draft.id, pod.id)}>
                                Nächste Runde
                              </Button>
                            )}
                            {hasPodMatches && !podAllReported && !pod.timer_ends_at && (
                              <Group gap={4}>
                                <NumberInput w={60} size="xs" variant="filled"
                                  value={timerMinutes[pod.id] ?? 50}
                                  onChange={(v) => setTimerMinutes((prev) => ({ ...prev, [pod.id]: Number(v) }))}
                                  min={1} max={999} suffix="m" />
                                <Button size="compact-xs" variant="light" color="orange"
                                  loading={settingTimer === pod.id}
                                  leftSection={<IconClock size={12} />}
                                  onClick={() => setTimerForPod(pod, timerMinutes[pod.id] ?? 50)}>
                                  Timer
                                </Button>
                              </Group>
                            )}
                          </Group>
                        </Group>
                      );
                    })()}
                  </Paper>
                );
              })}
            </Stack>
          )}
          {(() => {
            const allMatches = matchesByDraft[draft.id] ?? [];
            const hasMatches = allMatches.length > 0;
            const openMatches = allMatches.filter((m) => !m.reported && !m.is_bye);
            const conflicts = allMatches.filter((m) => m.has_conflict);
            const allReported = hasMatches && openMatches.length === 0 && conflicts.length === 0;
            return (
              <Group justify="space-between" align="center">
                {hasMatches && (
                  <Group gap="xs">
                    <Text size="sm" c="dimmed">
                      {allMatches.filter((m) => m.reported).length}/{allMatches.length} Matches gemeldet
                    </Text>
                    {conflicts.length > 0 && <Badge color="red" size="xs">{conflicts.length} Konflikte</Badge>}
                  </Group>
                )}
                <Group gap="xs">
                  <Button size="xs" variant="light" leftSection={<IconDownload size={14} />}
                    onClick={() => downloadPdf(`/tournaments/${tournamentId}/drafts/${draft.id}/pods/pdf`, `pods-runde${draft.round_number}.pdf`)}>
                    Pods PDF
                  </Button>
                  {hasMatches && (
                    <Button size="xs" variant="light" leftSection={<IconDownload size={14} />}
                      onClick={() => downloadPdf(`/tournaments/${tournamentId}/drafts/${draft.id}/pairings/pdf`, `pairings-runde${draft.round_number}.pdf`)}>
                      Pairings PDF
                    </Button>
                  )}
                  {hasMatches && !allReported && draft.status !== "FINISHED" && (
                    <Group gap={4}>
                      <NumberInput w={70} size="xs" variant="filled"
                        value={timerMinutes["_bulk"] ?? 50}
                        onChange={(v) => setTimerMinutes((prev) => ({ ...prev, _bulk: Number(v) }))}
                        min={1} max={999} suffix="m" />
                      <Button size="xs" variant="light" color="orange"
                        loading={settingTimer === "all"}
                        leftSection={<IconClock size={14} />}
                        onClick={() => setTimerForAllPods(draft.pods, timerMinutes["_bulk"] ?? 50)}>
                        Timer
                      </Button>
                    </Group>
                  )}
                </Group>
              </Group>
            );
          })()}
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
                    <Button size="xs" variant="light" color="green" loading={simulating === "results"} onClick={() => simulateResults(false)}>Ergebnisse simulieren</Button>
                    <Button size="xs" variant="light" color="red" loading={simulating === "conflicts"} onClick={() => simulateResults(true)}>Ergebnisse + Konflikte</Button>
                  </>
                )}
                {(hasPhotoGaps || !hasMatches) && (
                  <>
                    <Button size="xs" variant="light" color="blue" loading={simulating === "photos"} onClick={() => simulatePhotos(false)}>Fotos simulieren</Button>
                    <Button size="xs" variant="light" color="orange" loading={simulating === "photos-incomplete"} onClick={() => simulatePhotos(true)}>Fotos (lückenhaft)</Button>
                  </>
                )}
              </Group>
            );
          })()}
          </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        );
      })}
      </Accordion>
      )}

      <Modal
        opened={selectedPlayer !== null}
        onClose={() => setSelectedPlayer(null)}
        title={selectedPlayer?.player.username ?? ""}
        size="lg"
      >
        {selectedPlayer && (
          <Stack gap="md">
            <SimpleGrid cols={3} spacing="md">
              {(["pool", "deck", "returned"] as const).map((type) => {
                const url = selectedPlayer.player[type];
                return (
                  <Stack key={type} gap={4} align="center">
                    <Text size="xs" fw={600} c="dimmed">{type.toUpperCase()}</Text>
                    {url ? (
                      <div style={{ position: "relative", width: "100%" }}>
                        <MantineImage
                          src={`/api${url}`}
                          radius="md"
                          fit="contain"
                          h={200}
                          style={{ cursor: "pointer" }}
                          onClick={() => setFullscreenPhoto(`/api${url}`)}
                        />
                        <Group gap={4} style={{ position: "absolute", top: 4, right: 4 }}>
                          <ActionIcon size="xs" variant="filled" color="dark" opacity={0.7} onClick={() => setFullscreenPhoto(`/api${url}`)}>
                            <IconMaximize size={12} />
                          </ActionIcon>
                          <ActionIcon
                            size="xs" variant="filled" color="dark" opacity={0.7}
                            component="a"
                            href={`/api${url}`}
                            download={`${selectedPlayer.player.username}_${type}.jpg`}
                          >
                            <IconDownload size={12} />
                          </ActionIcon>
                        </Group>
                      </div>
                    ) : (
                      <Paper withBorder p="xl" radius="md" style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
                        <Text c="red" size="sm">Fehlt</Text>
                      </Paper>
                    )}
                  </Stack>
                );
              })}
            </SimpleGrid>
            {(!selectedPlayer.player.pool || !selectedPlayer.player.deck || !selectedPlayer.player.returned) && (
              <Button
                size="xs"
                variant="light"
                color="blue"
                onClick={async () => {
                  try {
                    const res = await apiFetch<{ access_token: string }>("/auth/impersonate", {
                      method: "POST",
                      body: JSON.stringify({ user_id: selectedPlayer.player.user_id }),
                    });
                    if (token) localStorage.setItem("admin_token", token);
                    await setToken(res.access_token);
                    navigate("/");
                  } catch (e) {
                    setError(translateError(e instanceof Error ? e.message : "Error"));
                  }
                }}
              >
                Als {selectedPlayer.player.username} anmelden
              </Button>
            )}
          </Stack>
        )}
      </Modal>
      <Modal
        opened={fullscreenPhoto !== null}
        onClose={() => setFullscreenPhoto(null)}
        size="xl"
        padding={0}
        withCloseButton
      >
        {fullscreenPhoto && (
          <Stack gap="xs" p="md">
            <MantineImage src={fullscreenPhoto} radius="md" fit="contain" />
            <Button
              size="xs"
              variant="light"
              leftSection={<IconDownload size={14} />}
              component="a"
              href={fullscreenPhoto}
              download
            >
              Download
            </Button>
          </Stack>
        )}
      </Modal>
      <Modal opened={resolveState !== null} onClose={() => setResolveState(null)} title="Konflikt lösen">
        {resolveState && (
          <Stack>
            <Text><strong>{resolveState.match.player1_username}</strong> vs.{" "}
              <strong>{resolveState.match.player2_username ?? "—"}</strong></Text>
            {resolveState.match.p1_reported_p1_wins !== null && (
              <Text size="sm" c="dimmed">Gemeldet von Sp.1: {resolveState.match.p1_reported_p1_wins} – {resolveState.match.p1_reported_p2_wins}</Text>
            )}
            {resolveState.match.p2_reported_p1_wins !== null && (
              <Text size="sm" c="dimmed">Gemeldet von Sp.2: {resolveState.match.p2_reported_p1_wins} – {resolveState.match.p2_reported_p2_wins}</Text>
            )}
            <NumberInput label={`Siege ${resolveState.match.player1_username}`}
              value={resolveState.p1Wins} onChange={(v) => setResolveState((s) => s ? { ...s, p1Wins: Number(v) } : s)} min={0} max={3} />
            <NumberInput label={`Siege ${resolveState.match.player2_username ?? "Spieler 2"}`}
              value={resolveState.p2Wins} onChange={(v) => setResolveState((s) => s ? { ...s, p2Wins: Number(v) } : s)} min={0} max={3} />
            <Button onClick={resolveMatch} loading={resolving} color="red">Ergebnis festlegen</Button>
          </Stack>
        )}
      </Modal>
      <Modal
        opened={confirmCancelTimer !== null}
        onClose={() => setConfirmCancelTimer(null)}
        title="Timer abbrechen?"
        size="sm"
      >
        {confirmCancelTimer && (
          <Stack>
            <Text size="sm">
              Timer für Pod {confirmCancelTimer.pod_number} ({confirmCancelTimer.cube_name}) wirklich abbrechen?
            </Text>
            <Group justify="flex-end" gap="xs">
              <Button variant="light" size="xs" onClick={() => setConfirmCancelTimer(null)}>
                Nein
              </Button>
              <Button color="red" size="xs"
                loading={settingTimer === confirmCancelTimer.id}
                onClick={async () => {
                  await clearTimerForPod(confirmCancelTimer);
                  setConfirmCancelTimer(null);
                }}>
                Ja, abbrechen
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

// ─── Standings Tab ───────────────────────────────────────────────────────────

function StandingsTab({ tournamentId }: { tournamentId: string }) {
  const { data: standings, loading } = useApi<StandingsEntry[]>(
    `/tournaments/${tournamentId}/standings`
  );

  if (loading) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  return (
    <Stack gap="md">
      <Group>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconDownload size={14} />}
          onClick={() => downloadPdf(`/tournaments/${tournamentId}/standings/pdf`, "standings.pdf")}
        >
          Standings PDF
        </Button>
      </Group>
      {(!standings || standings.length === 0) ? (
        <Text c="dimmed">Keine Standings vorhanden.</Text>
      ) : (
        <ScrollArea>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th ta="right">#</Table.Th>
                <Table.Th>Spieler</Table.Th>
                <Table.Th ta="right">Punkte</Table.Th>
                <Table.Th ta="right">W-L-D</Table.Th>
                <Table.Th ta="right">OMW%</Table.Th>
                <Table.Th ta="right">GW%</Table.Th>
                <Table.Th ta="right">OGW%</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {standings.map((s, i) => (
                <Table.Tr key={s.player_id} opacity={s.dropped ? 0.5 : 1}>
                  <Table.Td ta="right">{i + 1}</Table.Td>
                  <Table.Td fw={500}>
                    <Group gap="xs">
                      {s.username}
                      {s.dropped && (
                        <Badge color="red" size="xs">Dropped</Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td ta="right">{s.match_points}</Table.Td>
                  <Table.Td ta="right">{s.match_wins}-{s.match_losses}-{s.match_draws}</Table.Td>
                  <Table.Td ta="right">{(s.omw_percent * 100).toFixed(2)}%</Table.Td>
                  <Table.Td ta="right">{(s.gw_percent * 100).toFixed(2)}%</Table.Td>
                  <Table.Td ta="right">{(s.ogw_percent * 100).toFixed(2)}%</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
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
            Runden
          </Tabs.Tab>
          <Tabs.Tab value="standings" leftSection={<IconTrophy size={16} />}>
            Standings
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview">
          <OverviewTab tournament={tournament} onRefetch={refetch} />
        </Tabs.Panel>

        <Tabs.Panel value="cubes">
          <CubesTab tournament={tournament} onRefetch={refetch} />
        </Tabs.Panel>

        <Tabs.Panel value="players">
          <PlayersTab tournament={tournament} onRefetch={refetch} />
        </Tabs.Panel>

        <Tabs.Panel value="drafts">
          <DraftsTab tournamentId={id} isTest={tournament.is_test} tournament={tournament} />
        </Tabs.Panel>

        <Tabs.Panel value="standings">
          <StandingsTab tournamentId={id} />
        </Tabs.Panel>

      </Tabs>
    </Container>
  );
}
