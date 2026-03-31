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

interface CubeCobraPreview {
  name: string;
  image_url: string | null;
  artist: string | null;
  max_players: number | null;
}

export function AdminCubes() {
  const { data: cubes, refetch } = useApi<Cube[]>("/cubes");
  const navigate = useNavigate();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCube, setEditingCube] = useState<Cube | null>(null);
  const [cobraId, setCobraId] = useState("");
  const [preview, setPreview] = useState<CubeCobraPreview | null>(null);
  const [cubeName, setCubeName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState<Cube | null>(null);

  const openCreate = () => {
    setEditingCube(null);
    setCobraId("");
    setPreview(null);
    setCubeName("");
    setMaxPlayers(undefined);
    setModalOpen(true);
  };

  const openEdit = (cube: Cube) => {
    setEditingCube(cube);
    setCubeName(cube.name);
    setMaxPlayers(cube.max_players ?? undefined);
    setPreview(null);
    setModalOpen(true);
  };

  const loadPreview = async () => {
    setLoading(true);
    try {
      const meta = await apiFetch<CubeCobraPreview>(`/cubes/cubecobra/${cobraId}`);
      setPreview(meta);
      setCubeName(meta.name);
      setMaxPlayers(meta.max_players ?? undefined);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  };

  const saveCube = async () => {
    setLoading(true);
    try {
      if (editingCube) {
        await apiFetch(`/cubes/${editingCube.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: cubeName, max_players: maxPlayers ?? null }),
        });
      } else {
        await apiFetch<Cube>("/cubes", {
          method: "POST",
          body: JSON.stringify({
            cubecobra_id: cobraId,
            name: cubeName,
            max_players: maxPlayers ?? null,
          }),
        });
      }
      setModalOpen(false);
      setPreview(null);
      refetch();
    } finally {
      setLoading(false);
    }
  };

  const deleteCube = async (id: string) => {
    await apiFetch(`/cubes/${id}`, { method: "DELETE" });
    refetch();
  };

  const refreshCube = (cube: Cube) => {
    setConfirmRefresh(cube);
  };

  const confirmRefreshCube = async () => {
    if (!confirmRefresh) return;
    setLoading(true);
    try {
      await apiFetch(`/cubes/${confirmRefresh.id}/refresh`, { method: "POST" });
      setConfirmRefresh(null);
      refetch();
    } finally {
      setLoading(false);
    }
  };

  const cubeCobraUrl = (cube: Cube) =>
    cube.cubecobra_id ? `https://cubecobra.com/cube/overview/${cube.cubecobra_id}` : null;

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
            {cubes?.map((cube) => {
              const url = cubeCobraUrl(cube);
              return (
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
                              textShadow: "0 0 8px rgba(0,0,0,0.7)",
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
                    {url ? (
                      <Text
                        component="a"
                        href={url}
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
                          onClick={() => refreshCube(cube)}
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
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Modal
        opened={modalOpen}
        onClose={() => { setModalOpen(false); setPreview(null); }}
        title={editingCube ? "Cube bearbeiten" : "Neuer Cube"}
        size="md"
      >
        <Stack>
          {!editingCube && !preview && (
            <>
              <TextInput
                label="CubeCobra ID"
                required
                placeholder="z.B. 5d8d292a884bf534916603d7"
                value={cobraId}
                onChange={(e) => setCobraId(e.target.value)}
              />
              <Button onClick={loadPreview} loading={loading} disabled={!cobraId}>
                Laden
              </Button>
            </>
          )}

          {!editingCube && preview && (
            <>
              {preview.image_url && (
                <div style={{ position: "relative" }}>
                  <Image src={preview.image_url} height={150} radius="md" fit="cover" />
                  {preview.artist && (
                    <Text size="xs" c="white" style={{ position: "absolute", bottom: 4, right: 8, textShadow: "0 0 8px rgba(0,0,0,0.7)" }}>
                      {preview.artist}
                    </Text>
                  )}
                </div>
              )}
              <TextInput label="Name" value={cubeName} onChange={(e) => setCubeName(e.target.value)} />
              <NumberInput label="Max Spieler" value={maxPlayers} onChange={(v) => setMaxPlayers(v ? Number(v) : undefined)} min={1} />
              <Button onClick={saveCube} loading={loading} disabled={!cubeName}>Erstellen</Button>
            </>
          )}

          {editingCube && (
            <>
              {editingCube.image_url && (
                <div style={{ position: "relative" }}>
                  <Image src={editingCube.image_url} height={150} radius="md" fit="cover" />
                  {editingCube.artist && (
                    <Text size="xs" c="white" style={{ position: "absolute", bottom: 4, right: 8, textShadow: "0 0 8px rgba(0,0,0,0.7)" }}>
                      {editingCube.artist}
                    </Text>
                  )}
                </div>
              )}
              {editingCube.cubecobra_id && (
                <TextInput label="CubeCobra ID" value={editingCube.cubecobra_id} disabled />
              )}
              <TextInput label="Name" value={cubeName} onChange={(e) => setCubeName(e.target.value)} />
              <NumberInput label="Max Spieler" value={maxPlayers} onChange={(v) => setMaxPlayers(v ? Number(v) : undefined)} min={1} />
              <Button onClick={saveCube} loading={loading} disabled={!cubeName}>Speichern</Button>
            </>
          )}
        </Stack>
      </Modal>

      <Modal opened={confirmRefresh !== null} onClose={() => setConfirmRefresh(null)} title="Von CubeCobra aktualisieren?" size="sm">
        <Stack>
          <Text size="sm">Daten von CubeCobra neu laden? Manuelle Änderungen an Name und Max Spieler werden überschrieben.</Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="light" size="xs" onClick={() => setConfirmRefresh(null)}>Abbrechen</Button>
            <Button color="blue" size="xs" loading={loading} onClick={confirmRefreshCube}>Aktualisieren</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
