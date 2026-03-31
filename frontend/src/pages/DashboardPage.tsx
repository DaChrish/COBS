import { Container, Title, Text, Card, Group, Badge, Stack, Button, Center, Loader } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import type { TournamentDetail } from "../api/types";

const STATUS_COLORS: Record<string, string> = {
  SETUP: "gray",
  VOTING: "blue",
  DRAFTING: "orange",
  FINISHED: "green",
};

export function DashboardPage() {
  const { data, loading } = useApi<TournamentDetail[]>("/tournaments/mine");

  if (loading) return <Center h="50vh"><Loader /></Center>;

  const active = data?.filter((t) => t.status !== "FINISHED") ?? [];
  const past = data?.filter((t) => t.status === "FINISHED") ?? [];

  return (
    <Container size="sm">
      <Group justify="space-between" mb="lg">
        <Title order={2}>Meine Turniere</Title>
        <Button component="a" href="/join" variant="light" leftSection={<IconPlus size={16} />}>
          Beitreten
        </Button>
      </Group>

      {active.length === 0 && past.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          Noch keine Turniere. Tritt einem bei!
        </Text>
      )}

      {active.length > 0 && (
        <>
          <Text fw={500} mb="xs" c="dimmed" size="sm" tt="uppercase">Aktiv</Text>
          <Stack gap="sm" mb="xl">
            {active.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </Stack>
        </>
      )}

      {past.length > 0 && (
        <>
          <Text fw={500} mb="xs" c="dimmed" size="sm" tt="uppercase">Vergangene</Text>
          <Stack gap="sm">
            {past.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </Stack>
        </>
      )}
    </Container>
  );
}

function TournamentCard({ tournament: t }: { tournament: TournamentDetail }) {
  const navigate = useNavigate();
  return (
    <Card shadow="sm" padding="md" radius="md" withBorder
      style={{ cursor: "pointer" }} onClick={() => navigate(`/tournament/${t.id}`)}>
      <Group justify="space-between">
        <div>
          <Text fw={600}>{t.name}</Text>
          <Text size="sm" c="dimmed">
            {t.player_count} Spieler · {t.cube_count} Cubes · Max {t.max_rounds} Drafts
          </Text>
        </div>
        <Badge color={STATUS_COLORS[t.status]}>{t.status}</Badge>
      </Group>
    </Card>
  );
}
