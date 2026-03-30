import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Title,
  Table,
  Badge,
  Button,
  Group,
  Modal,
  TextInput,
  NumberInput,
  Stack,
  ScrollArea,
  Select,
  ActionIcon,
  Text,
} from "@mantine/core";
import { IconPlus, IconTestPipe, IconCube, IconX } from "@tabler/icons-react";
import { useApi } from "../../hooks/useApi";
import { apiFetch } from "../../api/client";
import type { Tournament, Cube } from "../../api/types";

const STATUS_COLORS: Record<string, string> = {
  SETUP: "gray",
  VOTING: "blue",
  DRAFTING: "orange",
  FINISHED: "green",
};

export function AdminOverview() {
  const { data: tournaments, refetch } = useApi<Tournament[]>("/tournaments");
  const { data: allCubes } = useApi<Cube[]>("/cubes");
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [name, setName] = useState("");
  const [maxRounds, setMaxRounds] = useState(3);
  const [selectedCubeIds, setSelectedCubeIds] = useState<string[]>([]);
  const [numPlayers, setNumPlayers] = useState(16);
  const [numCubes, setNumCubes] = useState(4);
  const [seed, setSeed] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);

  const createTournament = async () => {
    setLoading(true);
    try {
      const t = await apiFetch<Tournament>("/tournaments", {
        method: "POST",
        body: JSON.stringify({
          name: name || "Neues Turnier",
          max_rounds: maxRounds,
          cube_ids: selectedCubeIds,
        }),
      });
      setCreateOpen(false);
      setName("");
      setSelectedCubeIds([]);
      setMaxRounds(3);
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

  // suppress unused warning — refetch available if needed
  void refetch;

  return (
    <Container size="lg">
      <Group justify="space-between" mb="lg">
        <Title order={2}>Turniere</Title>
        <Group>
          <Button
            variant="subtle"
            leftSection={<IconCube size={16} />}
            onClick={() => navigate("/admin/cubes")}
          >
            Cubes
          </Button>
          <Button
            leftSection={<IconTestPipe size={16} />}
            variant="light"
            onClick={() => setTestOpen(true)}
          >
            Test-Turnier
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setCreateOpen(true)}
          >
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
              <Table.Tr
                key={t.id}
                style={{ cursor: "pointer" }}
                onClick={() => navigate(`/admin/tournament/${t.id}`)}
              >
                <Table.Td fw={500}>{t.name}</Table.Td>
                <Table.Td>
                  <Badge color={STATUS_COLORS[t.status]}>{t.status}</Badge>
                </Table.Td>
                <Table.Td ta="right">{t.player_count}</Table.Td>
                <Table.Td ta="right">{t.cube_count}</Table.Td>
                <Table.Td ff="monospace">{t.join_code}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      {/* Create Tournament Modal */}
      <Modal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Neues Turnier"
        size="md"
      >
        <Stack>
          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <NumberInput
            label="Max Runden"
            value={maxRounds}
            onChange={(v) => setMaxRounds(Number(v))}
            min={1}
            max={10}
          />
          <div>
            <Text size="sm" fw={500} mb={4}>
              Cubes
            </Text>
            {selectedCubeIds.length === 0 && (
              <Text size="sm" c="dimmed" mb="xs">
                Keine Cubes ausgewählt. Du kannst sie später hinzufügen.
              </Text>
            )}
            <Stack gap={4} mb="xs">
              {selectedCubeIds.map((id) => {
                const cube = allCubes?.find((c) => c.id === id);
                return cube ? (
                  <Group
                    key={id}
                    justify="space-between"
                    px="xs"
                    py={2}
                    style={{
                      borderRadius: 4,
                      background: "var(--mantine-color-default-hover)",
                    }}
                  >
                    <Text size="sm">{cube.name}</Text>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() =>
                        setSelectedCubeIds((prev) =>
                          prev.filter((x) => x !== id)
                        )
                      }
                    >
                      <IconX size={12} />
                    </ActionIcon>
                  </Group>
                ) : null;
              })}
            </Stack>
            <Select
              placeholder="Cube hinzufügen..."
              data={
                allCubes
                  ?.filter((c) => !selectedCubeIds.includes(c.id))
                  .map((c) => ({ value: c.id, label: c.name })) ?? []
              }
              searchable
              value={null}
              onChange={(v) => {
                if (v) setSelectedCubeIds((prev) => [...prev, v]);
              }}
            />
          </div>
          <Button onClick={createTournament} loading={loading}>
            Erstellen
          </Button>
        </Stack>
      </Modal>

      {/* Test Tournament Modal */}
      <Modal
        opened={testOpen}
        onClose={() => setTestOpen(false)}
        title="Test-Turnier erstellen"
      >
        <Stack>
          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Test Tournament"
          />
          <NumberInput
            label="Spieler"
            value={numPlayers}
            onChange={(v) => setNumPlayers(Number(v))}
            min={2}
            max={500}
          />
          <NumberInput
            label="Cubes"
            value={numCubes}
            onChange={(v) => setNumCubes(Number(v))}
            min={1}
            max={200}
          />
          <NumberInput
            label="Seed (optional)"
            value={seed}
            onChange={(v) => setSeed(v ? Number(v) : undefined)}
          />
          <Button onClick={createTestTournament} loading={loading}>
            Erstellen
          </Button>
        </Stack>
      </Modal>
    </Container>
  );
}
