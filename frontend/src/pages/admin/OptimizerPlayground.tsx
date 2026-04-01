import { useState, useEffect, useMemo } from "react";
import {
  Container,
  Title,
  Select,
  NumberInput,
  TextInput,
  Button,
  Group,
  Stack,
  Table,
  Badge,
  Text,
  Paper,
  ActionIcon,
  Modal,
  Loader,
  Alert,
  Accordion,
  SimpleGrid,
  Divider,
  Tooltip,
  ScrollArea,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconPlayerPlay,
  IconTrash,
  IconRefresh,
  IconAdjustments,
  IconPlus,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../hooks/useApi";
import { apiFetch } from "../../api/client";
import type { Tournament, Simulation, CubeVoteSummary } from "../../api/types";

export function OptimizerPlayground() {
  const navigate = useNavigate();
  const { data: tournaments } = useApi<Tournament[]>("/tournaments");

  const [selectedTournament, setSelectedTournament] = useState<string | null>(null);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [selectedSim, setSelectedSim] = useState<Simulation | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parameter state
  const [label, setLabel] = useState("");
  const [scoreWant, setScoreWant] = useState(5.0);
  const [scoreAvoid, setScoreAvoid] = useState(-200.0);
  const [scoreNeutral, setScoreNeutral] = useState(0.0);
  const [matchPointPenalty, setMatchPointPenalty] = useState(100000.0);
  const [earlyRoundBonus, setEarlyRoundBonus] = useState(3.0);
  const [lowerStandingBonus, setLowerStandingBonus] = useState(0.3);
  const [repeatAvoidMult, setRepeatAvoidMult] = useState(4.0);
  const [avoidPenaltyScaling, setAvoidPenaltyScaling] = useState(1.0);

  // Test tournament modal
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testPlayers, setTestPlayers] = useState(16);
  const [testCubes, setTestCubes] = useState(4);
  const [testSeed, setTestSeed] = useState<number | undefined>();
  const [testLoading, setTestLoading] = useState(false);

  // Vote summary for the selected tournament
  const [voteSummary, setVoteSummary] = useState<CubeVoteSummary[]>([]);

  useEffect(() => {
    if (!selectedTournament) { setVoteSummary([]); return; }
    apiFetch<CubeVoteSummary[]>(`/tournaments/${selectedTournament}/votes/summary`)
      .then(setVoteSummary)
      .catch(() => setVoteSummary([]));
  }, [selectedTournament]);

  // Per-player all votes (only D/A) for tooltips
  const playerAllVotes = useMemo(() => {
    const map: Record<string, { cube: string; vote: string }[]> = {};
    for (const cs of voteSummary) {
      for (const v of cs.votes) {
        if (v.vote === "NEUTRAL") continue;
        if (!map[v.username]) map[v.username] = [];
        map[v.username].push({ cube: cs.cube_name, vote: v.vote });
      }
    }
    return map;
  }, [voteSummary]);

  const resetDefaults = () => {
    setScoreWant(5.0);
    setScoreAvoid(-200.0);
    setScoreNeutral(0.0);
    setMatchPointPenalty(100000.0);
    setEarlyRoundBonus(3.0);
    setLowerStandingBonus(0.3);
    setRepeatAvoidMult(4.0);
    setAvoidPenaltyScaling(1.0);
  };

  const loadSimulations = async () => {
    if (!selectedTournament) return;
    try {
      const sims = await apiFetch<Simulation[]>(`/tournaments/${selectedTournament}/simulations`);
      setSimulations(sims);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    }
  };

  useEffect(() => {
    if (selectedTournament) {
      setSelectedSim(null);
      setSimulations([]);
      loadSimulations();
    }
  }, [selectedTournament]);

  const simulate = async () => {
    if (!selectedTournament) return;
    setSimulating(true);
    setError(null);
    try {
      const sim = await apiFetch<Simulation>(`/tournaments/${selectedTournament}/simulate-draft`, {
        method: "POST",
        body: JSON.stringify({
          label: label || undefined,
          score_want: scoreWant,
          score_avoid: scoreAvoid,
          score_neutral: scoreNeutral,
          match_point_penalty_weight: matchPointPenalty,
          early_round_bonus: earlyRoundBonus,
          lower_standing_bonus: lowerStandingBonus,
          repeat_avoid_multiplier: repeatAvoidMult,
          avoid_penalty_scaling: avoidPenaltyScaling,
        }),
      });
      setSimulations((prev) => [sim, ...prev]);
      setSelectedSim(sim);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation fehlgeschlagen");
    } finally {
      setSimulating(false);
    }
  };

  const deleteSim = async (simId: string) => {
    if (!selectedTournament) return;
    try {
      await apiFetch(`/tournaments/${selectedTournament}/simulations/${simId}`, {
        method: "DELETE",
      });
      setSimulations((prev) => prev.filter((s) => s.id !== simId));
      if (selectedSim?.id === simId) setSelectedSim(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
    }
  };

  const createTestTournament = async () => {
    setTestLoading(true);
    try {
      const t = await apiFetch<{ tournament_id: string }>("/test/tournament", {
        method: "POST",
        body: JSON.stringify({
          name: "Test Tournament",
          num_players: testPlayers,
          num_cubes: testCubes,
          seed: testSeed ?? null,
        }),
      });
      setTestModalOpen(false);
      setSelectedTournament(t.tournament_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test-Turnier fehlgeschlagen");
    } finally {
      setTestLoading(false);
    }
  };

  // suppress unused warnings
  void navigate;
  void IconArrowLeft;
  void IconAdjustments;

  return (
    <Container size="lg">
      <Group justify="space-between" mb="lg">
        <Title order={2}>Optimizer Playground</Title>
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate("/admin")}>
          Zurück
        </Button>
      </Group>

      {/* Tournament Selector */}
      <Paper withBorder p="md" mb="md" radius="md">
        <Group>
          <Select
            label="Turnier"
            placeholder="Turnier auswählen..."
            data={tournaments?.map((t) => ({ value: t.id, label: t.name })) ?? []}
            value={selectedTournament}
            onChange={setSelectedTournament}
            searchable
            style={{ flex: 1 }}
          />
          <Button
            variant="light"
            leftSection={<IconPlus size={16} />}
            mt={24}
            onClick={() => setTestModalOpen(true)}
          >
            Test-Turnier erstellen
          </Button>
        </Group>
      </Paper>

      {/* Parameter Controls */}
      {selectedTournament && (
        <Paper withBorder p="md" mb="md" radius="md">
          <Title order={4} mb="sm">Parameter</Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <NumberInput label="score_want" description="Default: 5.0" value={scoreWant}
              onChange={(v) => setScoreWant(Number(v))} step={0.5} decimalScale={1} />
            <NumberInput label="score_avoid" description="Default: -200.0" value={scoreAvoid}
              onChange={(v) => setScoreAvoid(Number(v))} step={10} decimalScale={1} />
            <NumberInput label="score_neutral" description="Default: 0.0" value={scoreNeutral}
              onChange={(v) => setScoreNeutral(Number(v))} step={0.5} decimalScale={1} />
            <NumberInput label="match_point_penalty_weight" description="Default: 100000.0" value={matchPointPenalty}
              onChange={(v) => setMatchPointPenalty(Number(v))} step={1000} />
            <NumberInput label="early_round_bonus" description="Default: 3.0" value={earlyRoundBonus}
              onChange={(v) => setEarlyRoundBonus(Number(v))} step={0.5} decimalScale={1} />
            <NumberInput label="lower_standing_bonus" description="Default: 0.3" value={lowerStandingBonus}
              onChange={(v) => setLowerStandingBonus(Number(v))} step={0.1} decimalScale={2} />
            <NumberInput label="repeat_avoid_multiplier" description="Default: 4.0" value={repeatAvoidMult}
              onChange={(v) => setRepeatAvoidMult(Number(v))} step={0.5} decimalScale={1} />
            <NumberInput label="avoid_penalty_scaling" description="Default: 1.0 (0=aus)" value={avoidPenaltyScaling}
              onChange={(v) => setAvoidPenaltyScaling(Number(v))} step={0.1} decimalScale={2} />
          </SimpleGrid>
          <Divider my="sm" />
          <Group>
            <TextInput
              label="Label"
              placeholder="Simulation benennen..."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{ flex: 1 }}
            />
          </Group>
          <Group mt="sm">
            <Button leftSection={<IconRefresh size={16} />} variant="light" onClick={resetDefaults}>
              Zurücksetzen
            </Button>
            <Button leftSection={<IconPlayerPlay size={16} />} onClick={simulate} loading={simulating}>
              Simulieren
            </Button>
          </Group>
        </Paper>
      )}

      {/* Vote Overview */}
      {selectedTournament && voteSummary.length > 0 && !selectedSim && (
        <Paper withBorder p="md" mb="md" radius="md">
          <Title order={4} mb="sm">Vote-Übersicht</Title>
          <ScrollArea>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Cube</Table.Th>
                  <Table.Th ta="right">Desired</Table.Th>
                  <Table.Th ta="right">Neutral</Table.Th>
                  <Table.Th ta="right">Avoid</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {voteSummary.map((vs) => (
                  <Table.Tr key={vs.tournament_cube_id}>
                    <Table.Td fw={500}>{vs.cube_name}</Table.Td>
                    <Table.Td ta="right"><Text c="green" size="sm">{vs.desired}</Text></Table.Td>
                    <Table.Td ta="right"><Text c="dimmed" size="sm">{vs.neutral}</Text></Table.Td>
                    <Table.Td ta="right"><Text c="red" size="sm">{vs.avoid}</Text></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      )}

      {error && (
        <Alert color="red" mb="md" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Results */}
      {selectedTournament && (
        <Paper withBorder p="md" radius="md">
          {simulating && !selectedSim && (
            <Group justify="center" py="xl">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">Simuliere...</Text>
            </Group>
          )}

          {!selectedSim ? (
            <>
              <Title order={4} mb="sm">Simulationen</Title>
              {simulations.length === 0 ? (
                <Text size="sm" c="dimmed">Noch keine Simulationen vorhanden.</Text>
              ) : (
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Label</Table.Th>
                      <Table.Th ta="right">Spieler</Table.Th>
                      <Table.Th ta="right">Pods</Table.Th>
                      <Table.Th ta="right">D</Table.Th>
                      <Table.Th ta="right">N</Table.Th>
                      <Table.Th ta="right">A</Table.Th>
                      <Table.Th ta="right">Objective</Table.Th>
                      <Table.Th ta="right">Max Δ</Table.Th>
                      <Table.Th ta="right">ms</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {simulations.map((s) => (
                      <Table.Tr key={s.id} style={{ cursor: "pointer" }} onClick={() => setSelectedSim(s)}>
                        <Table.Td>{s.label || "\u2014"}</Table.Td>
                        <Table.Td ta="right">{s.player_count}</Table.Td>
                        <Table.Td ta="right">{s.pod_count}</Table.Td>
                        <Table.Td ta="right"><Text c="green" size="sm">{s.total_desired}</Text></Table.Td>
                        <Table.Td ta="right"><Text c="dimmed" size="sm">{s.total_neutral}</Text></Table.Td>
                        <Table.Td ta="right"><Text c="red" size="sm">{s.total_avoid}</Text></Table.Td>
                        <Table.Td ta="right">{s.objective_score.toFixed(0)}</Table.Td>
                        <Table.Td ta="right">{s.max_standings_diff}</Table.Td>
                        <Table.Td ta="right">{s.solver_time_ms}</Table.Td>
                        <Table.Td>
                          <ActionIcon variant="subtle" color="red" size="sm"
                            onClick={(e) => { e.stopPropagation(); deleteSim(s.id); }}>
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </>
          ) : (
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={4}>{selectedSim.label || "Simulation"}</Title>
                <Button variant="light" size="xs" onClick={() => setSelectedSim(null)}>Zurück zur Liste</Button>
              </Group>
              <Group gap="md">
                <Badge color="green" variant="light">D: {selectedSim.total_desired}</Badge>
                <Badge color="gray" variant="light">N: {selectedSim.total_neutral}</Badge>
                <Badge color="red" variant="light">A: {selectedSim.total_avoid}</Badge>
                <Text size="sm" c="dimmed">Objective: {selectedSim.objective_score.toFixed(1)}</Text>
                <Text size="sm" c="dimmed">Max Δ: {selectedSim.max_standings_diff}</Text>
                <Text size="sm" c="dimmed">{selectedSim.solver_time_ms}ms</Text>
              </Group>

              <Accordion variant="separated">
                <Accordion.Item value="config">
                  <Accordion.Control><Text size="sm" fw={500}>Konfiguration</Text></Accordion.Control>
                  <Accordion.Panel>
                    <SimpleGrid cols={2} spacing="xs">
                      {Object.entries(selectedSim.config).map(([k, v]) => (
                        <Group key={k} justify="space-between">
                          <Text size="xs" c="dimmed">{k}</Text>
                          <Text size="xs" fw={500}>{v}</Text>
                        </Group>
                      ))}
                    </SimpleGrid>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>

              <Stack gap="sm">
                {selectedSim.result.pods.map((pod, i) => {
                  const podPlayerNames = new Set(pod.players.map((p) => p.username));
                  const cubeVotes = voteSummary.find((v) => v.cube_name === pod.cube_name);
                  return (
                    <Paper key={i} withBorder p="md" radius="md">
                      <Group justify="space-between" mb="xs">
                        <Tooltip multiline w={250} withArrow label={(() => {
                          if (!cubeVotes) return "Keine Votes";
                          const desired = cubeVotes.votes.filter((v) => v.vote === "DESIRED");
                          const avoid = cubeVotes.votes.filter((v) => v.vote === "AVOID");
                          if (desired.length === 0 && avoid.length === 0) return "Alle neutral";
                          return (
                            <Stack gap={4}>
                              {desired.length > 0 && (<>
                                <Text size="xs" fw={700} c="green.7">Desired ({desired.length})</Text>
                                <Group gap={4} wrap="wrap">
                                  {desired.map((v, j) => (
                                    <Text key={j} size="xs" fw={podPlayerNames.has(v.username) ? 700 : 400}
                                      c={podPlayerNames.has(v.username) ? "green.7" : "dimmed"}>
                                      {v.username}{podPlayerNames.has(v.username) ? " ●" : ""}
                                    </Text>
                                  ))}
                                </Group>
                              </>)}
                              {avoid.length > 0 && (<>
                                <Text size="xs" fw={700} c="red.7" mt={desired.length > 0 ? 4 : 0}>Avoid ({avoid.length})</Text>
                                <Group gap={4} wrap="wrap">
                                  {avoid.map((v, j) => (
                                    <Text key={j} size="xs" fw={podPlayerNames.has(v.username) ? 700 : 400}
                                      c={podPlayerNames.has(v.username) ? "red.7" : "dimmed"}>
                                      {v.username}{podPlayerNames.has(v.username) ? " ●" : ""}
                                    </Text>
                                  ))}
                                </Group>
                              </>)}
                            </Stack>
                          );
                        })()}>
                          <Text fw={600} style={{ cursor: "pointer" }}>Pod {i + 1} · {pod.cube_name}</Text>
                        </Tooltip>
                        <Group gap="xs">
                          <Badge size="xs" color="green" variant="light">{pod.desired}D</Badge>
                          <Badge size="xs" color="gray" variant="light">{pod.neutral}N</Badge>
                          <Badge size="xs" color="red" variant="light">{pod.avoid}A</Badge>
                          {pod.standings_diff > 0 && <Badge size="xs" color="orange" variant="light">Δ{pod.standings_diff}</Badge>}
                        </Group>
                      </Group>
                      <Group gap={6} wrap="wrap">
                        {pod.players.map((p) => (
                          <Tooltip key={p.id} multiline w={250} withArrow label={
                            <Stack gap={2}>
                              {playerAllVotes[p.username]?.length ? playerAllVotes[p.username].map((v, j) => (
                                <Group key={j} justify="space-between" gap="xs">
                                  <Text size="xs" fw={500} c={v.vote === "DESIRED" ? "green.7" : "red.7"}>{v.cube}</Text>
                                  <Text size="xs" fw={700} c={v.vote === "DESIRED" ? "green.7" : "red.7"}>
                                    {v.vote === "DESIRED" ? "✓" : "✗"}
                                  </Text>
                                </Group>
                              )) : <Text size="xs">Alle neutral</Text>}
                            </Stack>
                          }>
                            <Badge size="sm"
                              variant={p.vote === "DESIRED" ? "light" : p.vote === "AVOID" ? "light" : "outline"}
                              color={p.vote === "DESIRED" ? "green" : p.vote === "AVOID" ? "red" : "gray"}
                              style={{ cursor: "pointer" }}>
                              {p.username}{p.match_points > 0 ? ` (${p.match_points})` : ""}
                            </Badge>
                          </Tooltip>
                        ))}
                      </Group>
                    </Paper>
                  );
                })}
              </Stack>
            </Stack>
          )}
        </Paper>
      )}

      {/* Test Tournament Modal */}
      <Modal opened={testModalOpen} onClose={() => setTestModalOpen(false)} title="Test-Turnier erstellen">
        <Stack>
          <NumberInput label="Spieler" value={testPlayers} onChange={(v) => setTestPlayers(Number(v))} min={2} max={500} />
          <NumberInput label="Cubes" value={testCubes} onChange={(v) => setTestCubes(Number(v))} min={1} max={200} />
          <NumberInput label="Seed (optional)" value={testSeed} onChange={(v) => setTestSeed(v ? Number(v) : undefined)} />
          <Button onClick={createTestTournament} loading={testLoading}>Erstellen</Button>
        </Stack>
      </Modal>
    </Container>
  );
}
