import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Title,
  Table,
  Button,
  Group,
  Modal,
  TextInput,
  NumberInput,
  Stack,
  Text,
  ScrollArea,
  ActionIcon,
  Image,
} from "@mantine/core";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconRefresh,
  IconArrowLeft,
} from "@tabler/icons-react";
import { useApi } from "../../hooks/useApi";
import { apiFetch } from "../../api/client";
import type { Cube } from "../../api/types";

export function AdminCubes() {
  const { data: cubes, refetch } = useApi<Cube[]>("/cubes");
  const navigate = useNavigate();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCube, setEditingCube] = useState<Cube | null>(null);
  const [cobraId, setCobraId] = useState("");
  const [maxPlayers, setMaxPlayers] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);

  const openCreate = () => {
    setEditingCube(null);
    setCobraId("");
    setMaxPlayers(undefined);
    setModalOpen(true);
  };

  const openEdit = (cube: Cube) => {
    setEditingCube(cube);
    setCobraId(cube.cubecobra_id ?? "");
    setMaxPlayers(cube.max_players ?? undefined);
    setModalOpen(true);
  };

  const saveCube = async () => {
    setLoading(true);
    try {
      if (editingCube) {
        const body: Record<string, unknown> = {
          max_players: maxPlayers ?? null,
        };
        if (cobraId && cobraId !== editingCube.cubecobra_id) {
          body.cubecobra_id = cobraId;
        }
        await apiFetch(`/cubes/${editingCube.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch<Cube>("/cubes", {
          method: "POST",
          body: JSON.stringify({
            cubecobra_id: cobraId,
            max_players: maxPlayers ?? null,
          }),
        });
      }

      setModalOpen(false);
      refetch();
    } finally {
      setLoading(false);
    }
  };

  const deleteCube = async (id: string) => {
    await apiFetch(`/cubes/${id}`, { method: "DELETE" });
    refetch();
  };

  const refreshCube = async (id: string) => {
    await apiFetch(`/cubes/${id}/refresh`, { method: "POST" });
    refetch();
  };

  return (
    <Container size="lg">
      <Group justify="space-between" mb="lg">
        <Group>
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => navigate("/admin")}
          >
            Zurück
          </Button>
          <Title order={2}>Cubes</Title>
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Neuer Cube
        </Button>
      </Group>

      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={70}>Bild</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th ta="right">Max Spieler</Table.Th>
              <Table.Th w={120} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {cubes?.map((cube) => (
              <Table.Tr key={cube.id}>
                <Table.Td>
                  {cube.image_url ? (
                    <div style={{ position: "relative", width: 60, height: 60 }}>
                      <Image
                        src={cube.image_url}
                        w={60}
                        h={60}
                        radius="sm"
                        fit="cover"
                      />
                      {cube.artist && (
                        <Text
                          size="8px"
                          c="white"
                          style={{
                            position: "absolute",
                            bottom: 1,
                            right: 2,
                            textShadow: "0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)",
                            lineHeight: 1,
                          }}
                        >
                          {cube.artist}
                        </Text>
                      )}
                    </div>
                  ) : (
                    <Text size="xs" c="dimmed">
                      –
                    </Text>
                  )}
                </Table.Td>
                <Table.Td fw={500}>
                  {cube.description?.startsWith("http") ? (
                    <Text
                      component="a"
                      href={cube.description}
                      target="_blank"
                      c="blue"
                      td="underline"
                      size="sm"
                    >
                      {cube.name}
                    </Text>
                  ) : (
                    <Text size="sm">{cube.name}</Text>
                  )}
                </Table.Td>
                <Table.Td ta="right">
                  {cube.max_players ?? "–"}
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    {cube.cubecobra_id && (
                      <ActionIcon
                        variant="subtle"
                        onClick={() => refreshCube(cube.id)}
                        title="Von CubeCobra aktualisieren"
                      >
                        <IconRefresh size={16} />
                      </ActionIcon>
                    )}
                    <ActionIcon
                      variant="subtle"
                      onClick={() => openEdit(cube)}
                    >
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => deleteCube(cube.id)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCube ? "Cube bearbeiten" : "Neuer Cube"}
      >
        <Stack>
          <TextInput
            label="CubeCobra ID"
            required
            placeholder="z.B. 5d8d292a884bf534916603d7"
            value={cobraId}
            onChange={(e) => setCobraId(e.target.value)}
          />
          <NumberInput
            label="Max Spieler"
            value={maxPlayers}
            onChange={(v) => setMaxPlayers(v ? Number(v) : undefined)}
            min={1}
            placeholder="Optional"
          />
          <Button onClick={saveCube} loading={loading} disabled={!cobraId}>
            {editingCube ? "Speichern" : "Erstellen"}
          </Button>
        </Stack>
      </Modal>
    </Container>
  );
}
