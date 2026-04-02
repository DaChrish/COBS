import React, { useState, useEffect, useMemo } from "react";
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
  Tabs,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconPlayerPlay,
  IconTrash,
  IconRefresh,
  IconAdjustments,
  IconPlus,
  IconDownload,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../hooks/useApi";
import { apiFetch } from "../../api/client";
import type { Tournament, Simulation, CubeVoteSummary, BatchAnalysis } from "../../api/types";

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

  // --- Batch-Analyse state ---
  const [batchLabel, setBatchLabel] = useState("");
  const [batchPlayers, setBatchPlayers] = useState(16);
  const [batchCubes, setBatchCubes] = useState(4);
  const [batchRounds, setBatchRounds] = useState(3);
  const [batchSwissRounds, setBatchSwissRounds] = useState(3);
  const [batchNumSims, setBatchNumSims] = useState(10);
  const [batchVoteDist, setBatchVoteDist] = useState({ desired: 0.4, neutral: 0.3, avoid: 0.3 });
  const [batchProfiles, setBatchProfiles] = useState<{ count: number; desired_pct: number; neutral_pct: number; avoid_pct: number }[]>([]);
  const [bScoreWant, setBScoreWant] = useState(5.0);
  const [bScoreAvoid, setBScoreAvoid] = useState(-200.0);
  const [bScoreNeutral, setBScoreNeutral] = useState(0.0);
  const [bMatchPenalty, setBMatchPenalty] = useState(100000.0);
  const [bEarlyBonus, setBEarlyBonus] = useState(3.0);
  const [bLowerBonus, setBLowerBonus] = useState(0.3);
  const [bRepeatMult, setBRepeatMult] = useState(4.0);
  const [bAvoidScaling, setBAvoidScaling] = useState(1.0);

  const [batchAnalyses, setBatchAnalyses] = useState<BatchAnalysis[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<BatchAnalysis | null>(null);
  const [expandedSimIdx, setExpandedSimIdx] = useState<number | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);

  useEffect(() => {
    if (!selectedTournament) { setVoteSummary([]); return; }
    apiFetch<CubeVoteSummary[]>(`/tournaments/${selectedTournament}/votes/summary`)
      .then(setVoteSummary)
      .catch(() => setVoteSummary([]));
  }, [selectedTournament]);

  // Load batch analyses on mount
  useEffect(() => {
    apiFetch<BatchAnalysis[]>("/batch-analysis").then(setBatchAnalyses).catch(() => {});
  }, []);

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

  // --- Batch functions ---
  const runBatch = async () => {
    setBatchRunning(true);
    setError(null);
    try {
      const result = await apiFetch<BatchAnalysis>("/batch-analysis", {
        method: "POST",
        body: JSON.stringify({
          label: batchLabel || undefined,
          num_players: batchPlayers,
          num_cubes: batchCubes,
          max_rounds: batchRounds,
          swiss_rounds_per_draft: batchSwissRounds,
          num_simulations: batchNumSims,
          vote_distribution: batchVoteDist,
          player_profiles: batchProfiles,
          optimizer_config: {
            score_want: bScoreWant,
            score_avoid: bScoreAvoid,
            score_neutral: bScoreNeutral,
            match_point_penalty_weight: bMatchPenalty,
            early_round_bonus: bEarlyBonus,
            lower_standing_bonus: bLowerBonus,
            repeat_avoid_multiplier: bRepeatMult,
            avoid_penalty_scaling: bAvoidScaling,
          },
        }),
      });
      setBatchAnalyses((prev) => [result, ...prev]);
      setSelectedBatch(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Batch-Analyse fehlgeschlagen");
    } finally {
      setBatchRunning(false);
    }
  };

  const deleteBatch = async (id: string) => {
    try {
      await apiFetch(`/batch-analysis/${id}`, { method: "DELETE" });
      setBatchAnalyses((prev) => prev.filter((b) => b.id !== id));
      if (selectedBatch?.id === id) setSelectedBatch(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
    }
  };

  const downloadCsv = (id: string) => {
    const token = localStorage.getItem("token");
    fetch(`/api/batch-analysis/${id}/csv`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `batch-${id}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  const addProfile = () =>
    setBatchProfiles((prev) => [...prev, { count: 1, desired_pct: 0.1, neutral_pct: 0.0, avoid_pct: 0.9 }]);
  const removeProfile = (idx: number) =>
    setBatchProfiles((prev) => prev.filter((_, i) => i !== idx));
  const updateProfile = (idx: number, field: string, value: number) =>
    setBatchProfiles((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));

  const resetBatchDefaults = () => {
    setBScoreWant(5.0);
    setBScoreAvoid(-200.0);
    setBScoreNeutral(0.0);
    setBMatchPenalty(100000.0);
    setBEarlyBonus(3.0);
    setBLowerBonus(0.3);
    setBRepeatMult(4.0);
    setBAvoidScaling(1.0);
  };

  const voteDistSum = batchVoteDist.desired + batchVoteDist.neutral + batchVoteDist.avoid;

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

      {error && (
        <Alert color="red" mb="md" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Tabs defaultValue="single">
        <Tabs.List mb="md">
          <Tabs.Tab value="single">Einzelsimulation</Tabs.Tab>
          <Tabs.Tab value="batch">Batch-Analyse</Tabs.Tab>
        </Tabs.List>

        {/* ===== Tab 1: Einzelsimulation ===== */}
        <Tabs.Panel value="single">
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
                                          {v.username}{podPlayerNames.has(v.username) ? " \u25cf" : ""}
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
                                          {v.username}{podPlayerNames.has(v.username) ? " \u25cf" : ""}
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
                                        {v.vote === "DESIRED" ? "\u2713" : "\u2717"}
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
        </Tabs.Panel>

        {/* ===== Tab 2: Batch-Analyse ===== */}
        <Tabs.Panel value="batch">
          {/* Config Section */}
          <Paper withBorder p="md" mb="md" radius="md">
            <Title order={4} mb="sm">Batch-Konfiguration</Title>

            <TextInput
              label="Label"
              placeholder="Analyse benennen..."
              value={batchLabel}
              onChange={(e) => setBatchLabel(e.target.value)}
              mb="sm"
            />

            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" mb="sm">
              <NumberInput label="Spieler" value={batchPlayers} onChange={(v) => setBatchPlayers(Number(v))} min={2} />
              <NumberInput label="Cubes" value={batchCubes} onChange={(v) => setBatchCubes(Number(v))} min={1} />
              <NumberInput label="Max Rounds" value={batchRounds} onChange={(v) => setBatchRounds(Number(v))} min={1} />
              <NumberInput label="Swiss Rounds / Draft" value={batchSwissRounds} onChange={(v) => setBatchSwissRounds(Number(v))} min={1} />
              <NumberInput label="Simulationen" value={batchNumSims} onChange={(v) => setBatchNumSims(Number(v))} min={1} />
            </SimpleGrid>

            <Divider my="sm" />

            <Title order={5} mb="xs">Vote-Verteilung</Title>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" mb="xs">
              <NumberInput label="Desired" value={batchVoteDist.desired}
                onChange={(v) => setBatchVoteDist((d) => ({ ...d, desired: Number(v) }))}
                step={0.05} decimalScale={2} min={0} max={1} />
              <NumberInput label="Neutral" value={batchVoteDist.neutral}
                onChange={(v) => setBatchVoteDist((d) => ({ ...d, neutral: Number(v) }))}
                step={0.05} decimalScale={2} min={0} max={1} />
              <NumberInput label="Avoid" value={batchVoteDist.avoid}
                onChange={(v) => setBatchVoteDist((d) => ({ ...d, avoid: Number(v) }))}
                step={0.05} decimalScale={2} min={0} max={1} />
            </SimpleGrid>
            <Text size="xs" c={Math.abs(voteDistSum - 1.0) < 0.01 ? "dimmed" : "red"}>
              Summe: {voteDistSum.toFixed(2)} {Math.abs(voteDistSum - 1.0) >= 0.01 && "(sollte 1.0 sein)"}
            </Text>

            <Divider my="sm" />

            <Title order={5} mb="xs">Spieler-Profile</Title>
            {batchProfiles.length > 0 && (
              <Table mb="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Anzahl</Table.Th>
                    <Table.Th>Desired %</Table.Th>
                    <Table.Th>Neutral %</Table.Th>
                    <Table.Th>Avoid %</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {batchProfiles.map((p, idx) => (
                    <Table.Tr key={idx}>
                      <Table.Td>
                        <NumberInput size="xs" value={p.count} min={1}
                          onChange={(v) => updateProfile(idx, "count", Number(v))} />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput size="xs" value={p.desired_pct} step={0.05} decimalScale={2} min={0} max={1}
                          onChange={(v) => updateProfile(idx, "desired_pct", Number(v))} />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput size="xs" value={p.neutral_pct} step={0.05} decimalScale={2} min={0} max={1}
                          onChange={(v) => updateProfile(idx, "neutral_pct", Number(v))} />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput size="xs" value={p.avoid_pct} step={0.05} decimalScale={2} min={0} max={1}
                          onChange={(v) => updateProfile(idx, "avoid_pct", Number(v))} />
                      </Table.Td>
                      <Table.Td>
                        <ActionIcon variant="subtle" color="red" size="sm" onClick={() => removeProfile(idx)}>
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
            <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={addProfile}>
              Profil hinzufügen
            </Button>

            <Divider my="sm" />

            <Accordion variant="separated" mb="sm">
              <Accordion.Item value="optimizer-config">
                <Accordion.Control><Text size="sm" fw={500}>Optimizer-Konfiguration</Text></Accordion.Control>
                <Accordion.Panel>
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <NumberInput label="score_want" description="Default: 5.0" value={bScoreWant}
                      onChange={(v) => setBScoreWant(Number(v))} step={0.5} decimalScale={1} />
                    <NumberInput label="score_avoid" description="Default: -200.0" value={bScoreAvoid}
                      onChange={(v) => setBScoreAvoid(Number(v))} step={10} decimalScale={1} />
                    <NumberInput label="score_neutral" description="Default: 0.0" value={bScoreNeutral}
                      onChange={(v) => setBScoreNeutral(Number(v))} step={0.5} decimalScale={1} />
                    <NumberInput label="match_point_penalty_weight" description="Default: 100000.0" value={bMatchPenalty}
                      onChange={(v) => setBMatchPenalty(Number(v))} step={1000} />
                    <NumberInput label="early_round_bonus" description="Default: 3.0" value={bEarlyBonus}
                      onChange={(v) => setBEarlyBonus(Number(v))} step={0.5} decimalScale={1} />
                    <NumberInput label="lower_standing_bonus" description="Default: 0.3" value={bLowerBonus}
                      onChange={(v) => setBLowerBonus(Number(v))} step={0.1} decimalScale={2} />
                    <NumberInput label="repeat_avoid_multiplier" description="Default: 4.0" value={bRepeatMult}
                      onChange={(v) => setBRepeatMult(Number(v))} step={0.5} decimalScale={1} />
                    <NumberInput label="avoid_penalty_scaling" description="Default: 1.0 (0=aus)" value={bAvoidScaling}
                      onChange={(v) => setBAvoidScaling(Number(v))} step={0.1} decimalScale={2} />
                  </SimpleGrid>
                  <Group mt="sm">
                    <Button leftSection={<IconRefresh size={16} />} variant="light" size="xs" onClick={resetBatchDefaults}>
                      Zurücksetzen
                    </Button>
                  </Group>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>

            <Button leftSection={<IconPlayerPlay size={16} />} onClick={runBatch} loading={batchRunning}>
              Analyse starten
            </Button>
          </Paper>

          {/* Results Section */}
          <Paper withBorder p="md" radius="md">
            {batchRunning && !selectedBatch && (
              <Group justify="center" py="xl">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">Batch-Analyse läuft...</Text>
              </Group>
            )}

            {!selectedBatch ? (
              <>
                <Title order={4} mb="sm">Gespeicherte Analysen</Title>
                {batchAnalyses.length === 0 ? (
                  <Text size="sm" c="dimmed">Noch keine Batch-Analysen vorhanden.</Text>
                ) : (
                  <ScrollArea>
                    <Table striped highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Label</Table.Th>
                          <Table.Th ta="right">Spieler</Table.Th>
                          <Table.Th ta="right">Cubes</Table.Th>
                          <Table.Th ta="right">Drafts</Table.Th>
                          <Table.Th ta="right">Sims</Table.Th>
                          <Table.Th ta="right">D%</Table.Th>
                          <Table.Th ta="right">A%</Table.Th>
                          <Table.Th ta="right">Min D%</Table.Th>
                          <Table.Th ta="right">Max A%</Table.Th>
                          <Table.Th ta="right">ms</Table.Th>
                          <Table.Th />
                          <Table.Th />
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {batchAnalyses.map((b) => (
                          <Table.Tr key={b.id} style={{ cursor: "pointer" }} onClick={() => setSelectedBatch(b)}>
                            <Table.Td>{b.label || "\u2014"}</Table.Td>
                            <Table.Td ta="right">{b.num_players}</Table.Td>
                            <Table.Td ta="right">{b.num_cubes}</Table.Td>
                            <Table.Td ta="right">{b.max_rounds}</Table.Td>
                            <Table.Td ta="right">{b.num_simulations}</Table.Td>
                            <Table.Td ta="right"><Text c="green" size="sm">{b.avg_desired_pct.toFixed(1)}</Text></Table.Td>
                            <Table.Td ta="right"><Text c="red" size="sm">{b.avg_avoid_pct.toFixed(1)}</Text></Table.Td>
                            <Table.Td ta="right"><Text c="green" size="sm">{b.min_desired_pct.toFixed(1)}</Text></Table.Td>
                            <Table.Td ta="right"><Text c="red" size="sm">{b.max_avoid_pct.toFixed(1)}</Text></Table.Td>
                            <Table.Td ta="right">{b.total_time_ms}</Table.Td>
                            <Table.Td>
                              <ActionIcon variant="subtle" color="blue" size="sm"
                                onClick={(e) => { e.stopPropagation(); downloadCsv(b.id); }}>
                                <IconDownload size={14} />
                              </ActionIcon>
                            </Table.Td>
                            <Table.Td>
                              <ActionIcon variant="subtle" color="red" size="sm"
                                onClick={(e) => { e.stopPropagation(); deleteBatch(b.id); }}>
                                <IconTrash size={14} />
                              </ActionIcon>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                )}
              </>
            ) : (
              <Stack gap="md">
                <Group justify="space-between">
                  <Title order={4}>{selectedBatch.label || "Batch-Analyse"}</Title>
                  <Group gap="xs">
                    <Button variant="light" size="xs" leftSection={<IconDownload size={14} />}
                      onClick={() => downloadCsv(selectedBatch.id)}>CSV</Button>
                    <Button variant="light" size="xs" onClick={() => setSelectedBatch(null)}>Zurück</Button>
                  </Group>
                </Group>

                {/* Summary badges */}
                <Group gap="md">
                  <Badge color="green" variant="light" size="lg">D: {selectedBatch.avg_desired_pct.toFixed(1)}%</Badge>
                  <Badge color="gray" variant="light" size="lg">N: {selectedBatch.avg_neutral_pct.toFixed(1)}%</Badge>
                  <Badge color="red" variant="light" size="lg">A: {selectedBatch.avg_avoid_pct.toFixed(1)}%</Badge>
                  <Text size="sm" c="dimmed">{selectedBatch.total_time_ms}ms</Text>
                </Group>

                {/* Range info */}
                <Group gap="lg">
                  <Text size="sm">
                    Desired: {selectedBatch.min_desired_pct.toFixed(1)}% - {selectedBatch.max_desired_pct.toFixed(1)}%
                  </Text>
                  <Text size="sm">
                    Avoid: {selectedBatch.min_avoid_pct.toFixed(1)}% - {selectedBatch.max_avoid_pct.toFixed(1)}%
                  </Text>
                </Group>

                {/* Config accordion */}
                <Accordion variant="separated">
                  <Accordion.Item value="config">
                    <Accordion.Control><Text size="sm" fw={500}>Konfiguration</Text></Accordion.Control>
                    <Accordion.Panel>
                      <SimpleGrid cols={2} spacing="xs" mb="sm">
                        <Group justify="space-between"><Text size="xs" c="dimmed">Spieler</Text><Text size="xs" fw={500}>{selectedBatch.num_players}</Text></Group>
                        <Group justify="space-between"><Text size="xs" c="dimmed">Cubes</Text><Text size="xs" fw={500}>{selectedBatch.num_cubes}</Text></Group>
                        <Group justify="space-between"><Text size="xs" c="dimmed">Max Rounds</Text><Text size="xs" fw={500}>{selectedBatch.max_rounds}</Text></Group>
                        <Group justify="space-between"><Text size="xs" c="dimmed">Swiss Rounds</Text><Text size="xs" fw={500}>{selectedBatch.swiss_rounds_per_draft}</Text></Group>
                        <Group justify="space-between"><Text size="xs" c="dimmed">Simulationen</Text><Text size="xs" fw={500}>{selectedBatch.num_simulations}</Text></Group>
                      </SimpleGrid>
                      <Divider my="xs" />
                      <Text size="xs" fw={500} mb="xs">Vote-Verteilung</Text>
                      <SimpleGrid cols={3} spacing="xs" mb="sm">
                        <Group justify="space-between"><Text size="xs" c="dimmed">Desired</Text><Text size="xs" fw={500}>{selectedBatch.vote_distribution.desired}</Text></Group>
                        <Group justify="space-between"><Text size="xs" c="dimmed">Neutral</Text><Text size="xs" fw={500}>{selectedBatch.vote_distribution.neutral}</Text></Group>
                        <Group justify="space-between"><Text size="xs" c="dimmed">Avoid</Text><Text size="xs" fw={500}>{selectedBatch.vote_distribution.avoid}</Text></Group>
                      </SimpleGrid>
                      {selectedBatch.player_profiles.length > 0 && (
                        <>
                          <Text size="xs" fw={500} mb="xs">Spieler-Profile</Text>
                          {selectedBatch.player_profiles.map((p, idx) => (
                            <Text key={idx} size="xs" c="dimmed">
                              {p.count}x: D={p.desired_pct} N={p.neutral_pct} A={p.avoid_pct}
                            </Text>
                          ))}
                          <Divider my="xs" />
                        </>
                      )}
                      <Text size="xs" fw={500} mb="xs">Optimizer</Text>
                      <SimpleGrid cols={2} spacing="xs">
                        {Object.entries(selectedBatch.optimizer_config).map(([k, v]) => (
                          <Group key={k} justify="space-between">
                            <Text size="xs" c="dimmed">{k}</Text>
                            <Text size="xs" fw={500}>{v}</Text>
                          </Group>
                        ))}
                      </SimpleGrid>
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>

                {/* Per-simulation table */}
                <Title order={5}>Einzelne Simulationen</Title>
                <ScrollArea>
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th ta="right">#</Table.Th>
                        <Table.Th ta="right">D%</Table.Th>
                        <Table.Th ta="right">N%</Table.Th>
                        <Table.Th ta="right">A%</Table.Th>
                        <Table.Th ta="right">Total D</Table.Th>
                        <Table.Th ta="right">Total N</Table.Th>
                        <Table.Th ta="right">Total A</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {selectedBatch.simulations.map((sim, idx) => (
                        <React.Fragment key={idx}>
                          <Table.Tr style={{ cursor: "pointer" }} onClick={() => setExpandedSimIdx(expandedSimIdx === idx ? null : idx)}>
                            <Table.Td ta="right">{idx + 1}</Table.Td>
                            <Table.Td ta="right"><Text c="green" size="sm">{sim.desired_pct.toFixed(1)}</Text></Table.Td>
                            <Table.Td ta="right"><Text c="dimmed" size="sm">{sim.neutral_pct.toFixed(1)}</Text></Table.Td>
                            <Table.Td ta="right"><Text c="red" size="sm">{sim.avoid_pct.toFixed(1)}</Text></Table.Td>
                            <Table.Td ta="right">{sim.total_desired}</Table.Td>
                            <Table.Td ta="right">{sim.total_neutral}</Table.Td>
                            <Table.Td ta="right">{sim.total_avoid}</Table.Td>
                          </Table.Tr>
                          {expandedSimIdx === idx && sim.drafts && (
                            <Table.Tr>
                              <Table.Td colSpan={7} p="md" bg="var(--mantine-color-default-hover)">
                                <Stack gap="md">
                                  {/* Cube vote overview for this simulation */}
                                  {sim.cube_votes && sim.cube_votes.length > 0 && (
                                    <div>
                                      <Text size="sm" fw={600} mb="xs">Cube Votes</Text>
                                      <Group gap="sm" wrap="wrap">
                                        {sim.cube_votes.map((cv: any) => (
                                          <Paper key={cv.cube} withBorder p="xs" radius="sm">
                                            <Text size="xs" fw={500} mb={2}>{cv.cube}</Text>
                                            <Group gap={4}>
                                              <Badge size="xs" color="green" variant="light">{cv.desired}D</Badge>
                                              <Badge size="xs" color="gray" variant="light">{cv.neutral}N</Badge>
                                              <Badge size="xs" color="red" variant="light">{cv.avoid}A</Badge>
                                            </Group>
                                          </Paper>
                                        ))}
                                      </Group>
                                    </div>
                                  )}

                                  {/* Per-draft pod details */}
                                  {sim.drafts.map((draft: any) => (
                                    <div key={draft.round}>
                                      <Group gap="xs" mb="xs">
                                        <Text size="sm" fw={600}>Draft {draft.round}</Text>
                                        <Badge size="xs" color="green" variant="light">{draft.desired_pct}% D</Badge>
                                        <Badge size="xs" color="red" variant="light">{draft.avoid_pct}% A</Badge>
                                      </Group>
                                      {draft.pods && (
                                        <Group gap="xs" wrap="wrap">
                                          {draft.pods.map((pod: any, pi: number) => {
                                            const podPlayerIds = new Set((pod.players || []).map((p: any) => p.id));
                                            return (
                                              <Paper key={pi} withBorder p="xs" radius="sm" style={{ minWidth: 220 }}>
                                                <Tooltip multiline w={250} withArrow label={(() => {
                                                  if (!sim.cube_votes) return pod.cube;
                                                  const cv = sim.cube_votes.find((c: any) => c.cube === pod.cube);
                                                  if (!cv) return pod.cube;
                                                  return (
                                                    <Stack gap={2}>
                                                      <Text size="xs" fw={700}>{pod.cube}</Text>
                                                      <Text size="xs" c="green.7">{cv.desired} Desired</Text>
                                                      <Text size="xs" c="red.7">{cv.avoid} Avoid</Text>
                                                    </Stack>
                                                  );
                                                })()}>
                                                  <Text size="xs" fw={600} mb={4} style={{ cursor: "pointer" }}>Pod {pod.pod} · {pod.cube}</Text>
                                                </Tooltip>
                                                <Group gap={4} wrap="wrap">
                                                  {pod.players?.map((p: any) => {
                                                    const pVotes = sim.player_votes?.[p.id] || {};
                                                    const voteEntries = Object.entries(pVotes).filter(([, v]) => v !== "NEUTRAL");
                                                    return (
                                                      <Tooltip key={p.id} multiline w={200} withArrow label={
                                                        voteEntries.length > 0 ? (
                                                          <Stack gap={2}>
                                                            {voteEntries.map(([cid, v]: [string, any]) => (
                                                              <Group key={cid} justify="space-between" gap="xs">
                                                                <Text size="xs" c={v === "DESIRED" ? "green.7" : "red.7"}>{cid}</Text>
                                                                <Text size="xs" fw={700} c={v === "DESIRED" ? "green.7" : "red.7"}>
                                                                  {v === "DESIRED" ? "✓" : "✗"}
                                                                </Text>
                                                              </Group>
                                                            ))}
                                                          </Stack>
                                                        ) : "Alle neutral"
                                                      }>
                                                        <Badge size="xs" style={{ cursor: "pointer" }}
                                                          variant={p.vote === "DESIRED" ? "light" : p.vote === "AVOID" ? "light" : "outline"}
                                                          color={p.vote === "DESIRED" ? "green" : p.vote === "AVOID" ? "red" : "gray"}>
                                                          {p.id}{p.match_points > 0 ? ` (${p.match_points})` : ""}
                                                        </Badge>
                                                      </Tooltip>
                                                    );
                                                  }) || (
                                                    <Group gap={4}>
                                                      <Badge size="xs" color="green" variant="light">{pod.desired}D</Badge>
                                                      <Badge size="xs" color="gray" variant="light">{pod.neutral}N</Badge>
                                                      <Badge size="xs" color="red" variant="light">{pod.avoid}A</Badge>
                                                    </Group>
                                                  )}
                                                </Group>
                                              </Paper>
                                            );
                                          })}
                                        </Group>
                                      )}
                                    </div>
                                  ))}
                                </Stack>
                              </Table.Td>
                            </Table.Tr>
                          )}
                        </React.Fragment>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Stack>
            )}
          </Paper>
        </Tabs.Panel>
      </Tabs>

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
