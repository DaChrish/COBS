import { useParams, useNavigate } from "react-router-dom";
import { Container, Title, Text, Button, Card, Group, Badge, Stack, Center, Loader, Alert, Image } from "@mantine/core";
import { IconHandFinger, IconCards, IconTrophy } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";
import { useWebSocket } from "../../hooks/useWebSocket";
import { Timer } from "../../components/Timer";
import type { TournamentDetail, Draft } from "../../api/types";

const STATUS_COLORS: Record<string, string> = {
  SETUP: "gray", VOTING: "blue", DRAFTING: "orange", FINISHED: "green",
};

export function HubPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { data: tournament, loading } = useApi<TournamentDetail>(`/tournaments/${id}`);
  const { data: drafts, refetch: refetchDrafts } = useApi<Draft[]>(`/tournaments/${id}/drafts`);

  useWebSocket(id, (event) => {
    if (["pairings_ready", "match_reported", "timer_update", "draft_created", "status_changed"].includes(event.event)) {
      refetchDrafts();
    }
  });

  if (loading || !tournament) return <Center h="50vh"><Loader /></Center>;

  const myPlayer = tournament.players.find((p) => p.user_id === user?.id);

  return (
    <Container size="sm">
      <Group justify="space-between" mb="md">
        <div>
          <Title order={2}>{tournament.name}</Title>
          <Text size="sm" c="dimmed">
            {t("dashboard.playerCount", { count: tournament.player_count })} · {t("dashboard.cubeCount", { count: tournament.cube_count })} · {drafts?.length ?? 0}/{tournament.max_rounds} {t("hub.drafts")}
          </Text>
        </div>
        <Badge color={STATUS_COLORS[tournament.status]} size="lg">{tournament.status}</Badge>
      </Group>

      {tournament.status === "SETUP" && (
        <Alert color="gray" title={t("hub.waitingForAdmin")} mb="md">
          {t("hub.waitingForAdminDesc")}
        </Alert>
      )}

      {tournament.status === "VOTING" && (
        <Stack gap="md">
          <Button size="lg" fullWidth leftSection={<IconHandFinger size={20} />}
            onClick={() => navigate(`/tournament/${id}/vote`)}>
            {t("hub.voteNow")}
          </Button>
          <InfoCards tournament={tournament} />
        </Stack>
      )}

      {tournament.status === "DRAFTING" && drafts && drafts.length > 0 && (
        <Stack gap="md">
          <Stack gap="xs">
            {[...drafts].reverse().map((d) => {
              const isActive = d.status === "ACTIVE";
              const pod = d.pods.find((p) => p.players.some((pp) => pp.tournament_player_id === myPlayer?.id));
              const tc = pod ? tournament.cubes.find((c) => c.cube_name === pod.cube_name) : null;
              return isActive ? (
                <Card key={d.id} withBorder padding={0} radius="md"
                  style={{ cursor: "pointer" }} onClick={() => navigate(`/tournament/${id}/draft/${d.round_number}`)}>
                  {tc?.cube_image_url && (
                    <div style={{ position: "relative" }}>
                      <Image src={tc.cube_image_url} h={120} fit="cover" />
                      {tc.cube_artist && (
                        <Text size="xs" c="white" style={{ position: "absolute", bottom: 4, right: 8, textShadow: "0 0 8px rgba(0,0,0,0.7)" }}>
                          {tc.cube_artist}
                        </Text>
                      )}
                    </div>
                  )}
                  <Stack p="md" gap="xs">
                    <Badge color="orange" size="sm" w="fit-content">{t("common.active").toUpperCase()}</Badge>
                    <Text fw={600} size="lg">{pod ? pod.cube_name : `Draft ${d.round_number}`}</Text>
                    {pod && (
                      <Text size="sm" c="dimmed">
                        Pod {pod.pod_number} · Seat {pod.players.find(p => p.tournament_player_id === myPlayer?.id)?.seat_number} · {t("dashboard.playerCount", { count: pod.pod_size })}
                      </Text>
                    )}
                    {pod?.timer_ends_at && <Timer endsAt={pod.timer_ends_at} />}
                    <Button fullWidth mt="xs" leftSection={<IconCards size={16} />}>
                      {t("hub.goToDraft")}
                    </Button>
                  </Stack>
                </Card>
              ) : (
                <Card key={d.id} withBorder padding="xs" radius="md"
                  style={{ cursor: "pointer" }} onClick={() => navigate(`/tournament/${id}/draft/${d.round_number}`)}>
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap" style={{ overflow: "hidden" }}>
                      {tc?.cube_image_url && (
                        <Image src={tc.cube_image_url} w={36} h={36} radius="sm" fit="cover" style={{ flexShrink: 0 }} />
                      )}
                      <div>
                        <Text size="sm" fw={500}>Draft {d.round_number}</Text>
                        {pod && <Text size="xs" c="dimmed" truncate>{pod.cube_name}</Text>}
                      </div>
                    </Group>
                    <Badge size="xs" color="green" variant="light" style={{ flexShrink: 0 }}>{d.status}</Badge>
                  </Group>
                </Card>
              );
            })}
          </Stack>

          <Group grow>
            <Button variant="light" leftSection={<IconTrophy size={16} />}
              onClick={() => navigate(`/tournament/${id}/standings`)}>
              {t("hub.standings")}
            </Button>
            <Button variant="light" leftSection={<IconHandFinger size={16} />}
              onClick={() => navigate(`/tournament/${id}/vote`)}>
              {t("hub.myVotes")}
            </Button>
          </Group>
        </Stack>
      )}

      {tournament.status === "FINISHED" && (
        <Stack gap="md">
          <Alert color="green" title={t("hub.tournamentFinished")}>
            {t("hub.tournamentFinishedDesc")}
          </Alert>
          <Group grow>
            <Button variant="light" leftSection={<IconTrophy size={20} />}
              onClick={() => navigate(`/tournament/${id}/standings`)}>
              {t("hub.finalResults")}
            </Button>
            <Button variant="light" leftSection={<IconHandFinger size={16} />}
              onClick={() => navigate(`/tournament/${id}/vote`)}>
              {t("hub.myVotes")}
            </Button>
          </Group>
          {drafts && drafts.length > 0 && (
            <Stack gap="xs">
              <Text size="sm" c="dimmed" tt="uppercase" fw={500}>{t("hub.drafts")}</Text>
              {drafts.map((d) => {
                const pod = d.pods.find((p) => p.players.some((pp) => pp.tournament_player_id === myPlayer?.id));
                return (
                  <Card key={d.id} withBorder padding="xs" radius="md"
                    style={{ cursor: "pointer" }} onClick={() => navigate(`/tournament/${id}/draft/${d.round_number}`)}>
                    <Group justify="space-between">
                      <Group gap="xs">
                        <Text size="sm" fw={500}>Draft {d.round_number}</Text>
                        {pod && <Text size="sm" c="dimmed">· {pod.cube_name}</Text>}
                      </Group>
                      <Badge size="xs" color="green" variant="light">{d.status}</Badge>
                    </Group>
                  </Card>
                );
              })}
            </Stack>
          )}
        </Stack>
      )}
    </Container>
  );
}

function InfoCards({ tournament }: { tournament: TournamentDetail }) {
  const { t } = useTranslation();
  return (
    <Stack gap="xs">
      <Card withBorder p="sm"><Group justify="space-between"><Text c="dimmed" size="sm">{t("common.players")}</Text><Text fw={600}>{tournament.player_count}</Text></Group></Card>
      <Card withBorder p="sm"><Group justify="space-between"><Text c="dimmed" size="sm">{t("common.cubes")}</Text><Text fw={600}>{tournament.cube_count}</Text></Group></Card>
      <Card withBorder p="sm"><Group justify="space-between"><Text c="dimmed" size="sm">{t("hub.maxDrafts")}</Text><Text fw={600}>{tournament.max_rounds}</Text></Group></Card>
    </Stack>
  );
}
