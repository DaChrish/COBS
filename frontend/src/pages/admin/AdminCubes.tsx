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
  FileInput,
} from "@mantine/core";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconUpload,
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
  const [cubeName, setCubeName] = useState("");
  const [cubeDescription, setCubeDescription] = useState("");
  const [cubeMaxPlayers, setCubeMaxPlayers] = useState<number | undefined>();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const openCreate = () => {
    setEditingCube(null);
    setCubeName("");
    setCubeDescription("");
    setCubeMaxPlayers(undefined);
    setImageFile(null);
    setModalOpen(true);
  };

  const openEdit = (cube: Cube) => {
    setEditingCube(cube);
    setCubeName(cube.name);
    setCubeDescription(cube.description);
    setCubeMaxPlayers(cube.max_players ?? undefined);
    setImageFile(null);
    setModalOpen(true);
  };

  const saveCube = async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        name: cubeName,
        description: cubeDescription,
        max_players: cubeMaxPlayers ?? null,
      };

      if (editingCube) {
        await apiFetch(`/cubes/${editingCube.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });

        if (imageFile) {
          await uploadImage(editingCube.id, imageFile);
        }
      } else {
        const created = await apiFetch<Cube>("/cubes", {
          method: "POST",
          body: JSON.stringify(body),
        });

        if (imageFile) {
          await uploadImage(created.id, imageFile);
        }
      }

      setModalOpen(false);
      refetch();
    } finally {
      setLoading(false);
    }
  };

  const uploadImage = async (cubeId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("token");
    await fetch(`/api/cubes/${cubeId}/image`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
  };

  const deleteCube = async (id: string) => {
    await apiFetch(`/cubes/${id}`, { method: "DELETE" });
    refetch();
  };

  const handleImageClick = (cube: Cube) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        await uploadImage(cube.id, file);
        refetch();
      }
    };
    input.click();
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
              <Table.Th w={60}>Bild</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Beschreibung</Table.Th>
              <Table.Th ta="right">Max Spieler</Table.Th>
              <Table.Th w={100} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {cubes?.map((cube) => (
              <Table.Tr key={cube.id}>
                <Table.Td>
                  {cube.image_url ? (
                    <Image
                      src={`/api${cube.image_url}`}
                      w={40}
                      h={40}
                      radius="sm"
                      fit="cover"
                      style={{ cursor: "pointer" }}
                      onClick={() => handleImageClick(cube)}
                    />
                  ) : (
                    <ActionIcon
                      variant="light"
                      size={40}
                      onClick={() => handleImageClick(cube)}
                    >
                      <IconUpload size={18} />
                    </ActionIcon>
                  )}
                </Table.Td>
                <Table.Td fw={500}>{cube.name}</Table.Td>
                <Table.Td>
                  {cube.description.startsWith("http") ? (
                    <Text
                      component="a"
                      href={cube.description}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="sm"
                      c="blue"
                      td="underline"
                    >
                      {cube.description}
                    </Text>
                  ) : (
                    <Text size="sm">{cube.description}</Text>
                  )}
                </Table.Td>
                <Table.Td ta="right">
                  {cube.max_players ?? "–"}
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
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
            label="Name"
            required
            value={cubeName}
            onChange={(e) => setCubeName(e.target.value)}
          />
          <TextInput
            label="Beschreibung / Link"
            value={cubeDescription}
            onChange={(e) => setCubeDescription(e.target.value)}
          />
          <NumberInput
            label="Max Spieler"
            value={cubeMaxPlayers}
            onChange={(v) =>
              setCubeMaxPlayers(v ? Number(v) : undefined)
            }
            min={1}
            placeholder="Optional"
          />
          <FileInput
            label="Bild"
            accept="image/*"
            value={imageFile}
            onChange={setImageFile}
            leftSection={<IconUpload size={16} />}
            placeholder="Bild auswählen..."
          />
          <Button onClick={saveCube} loading={loading} disabled={!cubeName}>
            {editingCube ? "Speichern" : "Erstellen"}
          </Button>
        </Stack>
      </Modal>
    </Container>
  );
}
