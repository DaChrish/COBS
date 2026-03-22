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
} from "@mantine/core";
import { IconPlus, IconTestPipe } from "@tabler/icons-react";
import { useApi } from "../../hooks/useApi";
import { apiFetch } from "../../api/client";
import type { Tournament } from "../../api/types";

const STATUS_COLORS: Record<string, string> = {
  SETUP: "gray",
  VOTING: "blue",
  DRAFTING: "orange",
  FINISHED: "green",
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

  // suppress unused warning — refetch available if needed
  void refetch;

  return (
    <Container size="lg">
      <Group justify="space-between" mb="lg">
        <Title order={2}>Turniere</Title>
        <Group>
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
      >
        <Stack>
          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
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
