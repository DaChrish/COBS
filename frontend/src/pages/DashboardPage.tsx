import { Container, Title, Text, Card, Group, Badge, Stack, Button, Center, Loader } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useApi } from "../hooks/useApi";
import type { TournamentDetail } from "../api/types";

const STATUS_COLORS: Record<string, string> = {
  SETUP: "gray",
  VOTING: "blue",
  DRAFTING: "orange",
  FINISHED: "green",
};

export function DashboardPage() {
  const { t } = useTranslation();
  const { data, loading } = useApi<TournamentDetail[]>("/tournaments/mine");

  if (loading) return <Center h="50vh"><Loader /></Center>;

  const active = data?.filter((t) => t.status !== "FINISHED") ?? [];
  const past = data?.filter((t) => t.status === "FINISHED") ?? [];

  return (
    <Container size="sm">
      <Group justify="space-between" mb="lg">
        <Title order={2}>{t("dashboard.myTournaments")}</Title>
        <Button component="a" href="/join" variant="light" leftSection={<IconPlus size={16} />}>
          {t("dashboard.joinButton")}
        </Button>
      </Group>

      {active.length === 0 && past.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          {t("dashboard.noTournaments")}
        </Text>
      )}

      {active.length > 0 && (
        <>
          <Text fw={500} mb="xs" c="dimmed" size="sm" tt="uppercase">{t("dashboard.active")}</Text>
          <Stack gap="sm" mb="xl">
            {active.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </Stack>
        </>
      )}

      {past.length > 0 && (
        <>
          <Text fw={500} mb="xs" c="dimmed" size="sm" tt="uppercase">{t("dashboard.past")}</Text>
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
  const { t: tr } = useTranslation();
  return (
    <Card shadow="sm" padding="md" radius="md" withBorder
      style={{ cursor: "pointer" }} onClick={() => navigate(`/tournament/${t.id}`)}>
      <Group justify="space-between">
        <div>
          <Text fw={600}>{t.name}</Text>
          <Text size="sm" c="dimmed">
            {tr("dashboard.playerCount", { count: t.player_count })} · {tr("dashboard.cubeCount", { count: t.cube_count })} · {tr("dashboard.maxDrafts", { count: t.max_rounds })}
          </Text>
        </div>
        <Badge color={STATUS_COLORS[t.status]}>{t.status}</Badge>
      </Group>
    </Card>
  );
}
