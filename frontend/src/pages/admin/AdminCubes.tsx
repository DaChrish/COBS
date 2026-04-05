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
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      alert(e instanceof Error ? e.message : t("adminCubes.loadError"));
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

  const [confirmDelete, setConfirmDelete] = useState<Cube | null>(null);

  const deleteCube = async () => {
    if (!confirmDelete) return;
    await apiFetch(`/cubes/${confirmDelete.id}`, { method: "DELETE" });
    setConfirmDelete(null);
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
            {t("common.back")}
          </Button>
          <Title order={2}>{t("adminCubes.title")}</Title>
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          {t("adminCubes.newCube")}
        </Button>
      </Group>

      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={70}>{t("adminCubes.image")}</Table.Th>
              <Table.Th>{t("common.name")}</Table.Th>
              <Table.Th ta="right">{t("adminCubes.maxPlayers")}</Table.Th>
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
                          title={t("adminCubes.refreshFromCubeCobra")}
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
                        onClick={() => setConfirmDelete(cube)}
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
        title={editingCube ? t("adminCubes.editCube") : t("adminCubes.newCube")}
        size="md"
      >
        <Stack>
          {!editingCube && !preview && (
            <>
              <TextInput
                label={t("adminTournament.cubeCobraId")}
                required
                placeholder={t("adminTournament.cubeCobraPlaceholder")}
                value={cobraId}
                onChange={(e) => setCobraId(e.target.value)}
              />
              <Button onClick={loadPreview} loading={loading} disabled={!cobraId}>
                {t("common.load")}
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
              <TextInput label={t("common.name")} value={cubeName} onChange={(e) => setCubeName(e.target.value)} />
              <NumberInput label={t("adminCubes.maxPlayers")} value={maxPlayers} onChange={(v) => setMaxPlayers(v ? Number(v) : undefined)} min={1} />
              <Button onClick={saveCube} loading={loading} disabled={!cubeName}>{t("common.create")}</Button>
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
                <TextInput label={t("adminTournament.cubeCobraId")} value={editingCube.cubecobra_id} disabled />
              )}
              <TextInput label={t("common.name")} value={cubeName} onChange={(e) => setCubeName(e.target.value)} />
              <NumberInput label={t("adminCubes.maxPlayers")} value={maxPlayers} onChange={(v) => setMaxPlayers(v ? Number(v) : undefined)} min={1} />
              <Button onClick={saveCube} loading={loading} disabled={!cubeName}>{t("common.save")}</Button>
            </>
          )}
        </Stack>
      </Modal>

      <Modal opened={confirmRefresh !== null} onClose={() => setConfirmRefresh(null)} title={t("adminCubes.refreshTitle")} size="sm">
        <Stack>
          <Text size="sm">{t("adminCubes.refreshConfirm")}</Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="light" size="xs" onClick={() => setConfirmRefresh(null)}>{t("common.cancel")}</Button>
            <Button color="blue" size="xs" loading={loading} onClick={confirmRefreshCube}>{t("adminCubes.update")}</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title={t("adminCubes.deleteTitle")} size="sm">
        {confirmDelete && (
          <Stack>
            <Text size="sm" dangerouslySetInnerHTML={{ __html: t("adminCubes.deleteConfirm", { name: confirmDelete.name }) }} />
            <Group justify="flex-end" gap="xs">
              <Button variant="light" size="xs" onClick={() => setConfirmDelete(null)}>{t("common.cancel")}</Button>
              <Button color="red" size="xs" onClick={deleteCube}>{t("common.delete")}</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Container>
  );
}
