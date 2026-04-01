import { useParams, useNavigate } from "react-router-dom";
import { Container, Title, Text, Button, Card, Group, Badge, Stack, Center, Loader, Alert } from "@mantine/core";
import { IconHandFinger, IconCards, IconTrophy } from "@tabler/icons-react";
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
            {tournament.player_count} Spieler · {tournament.cube_count} Cubes · {drafts?.length ?? 0}/{tournament.max_rounds} Drafts
          </Text>
        </div>
        <Badge color={STATUS_COLORS[tournament.status]} size="lg">{tournament.status}</Badge>
      </Group>

      {tournament.status === "SETUP" && (
        <Alert color="gray" title="Warte auf Admin" mb="md">
          Das Turnier wurde noch nicht gestartet. Voting beginnt bald.
        </Alert>
      )}

      {tournament.status === "VOTING" && (
        <Stack gap="md">
          <Button size="lg" fullWidth leftSection={<IconHandFinger size={20} />}
            onClick={() => navigate(`/tournament/${id}/vote`)}>
            Jetzt abstimmen
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
              return isActive ? (
                <Card key={d.id} withBorder padding="md" radius="md"
                  style={{ cursor: "pointer" }} onClick={() => navigate(`/tournament/${id}/draft/${d.round_number}`)}>
                  <Badge color="orange" size="sm" mb="xs">AKTIV</Badge>
                  <Text fw={600} size="lg">{pod ? pod.cube_name : `Draft ${d.round_number}`}</Text>
                  {pod && (
                    <Text size="sm" c="dimmed">
                      Pod {pod.pod_number} · Seat {pod.players.find(p => p.tournament_player_id === myPlayer?.id)?.seat_number} · {pod.pod_size} Spieler
                    </Text>
                  )}
                  {pod?.timer_ends_at && <Timer endsAt={pod.timer_ends_at} />}
                  <Button fullWidth mt="sm" leftSection={<IconCards size={16} />}>
                    Zum Draft
                  </Button>
                </Card>
              ) : (
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

          <Group grow>
            <Button variant="light" leftSection={<IconTrophy size={16} />}
              onClick={() => navigate(`/tournament/${id}/standings`)}>
              Standings
            </Button>
            <Button variant="light" leftSection={<IconHandFinger size={16} />}
              onClick={() => navigate(`/tournament/${id}/vote`)}>
              Meine Votes
            </Button>
          </Group>
        </Stack>
      )}

      {tournament.status === "FINISHED" && (
        <Stack gap="md">
          <Alert color="green" title="Turnier beendet">
            Das Turnier ist abgeschlossen.
          </Alert>
          <Group grow>
            <Button variant="light" leftSection={<IconTrophy size={20} />}
              onClick={() => navigate(`/tournament/${id}/standings`)}>
              Endergebnis
            </Button>
            <Button variant="light" leftSection={<IconHandFinger size={16} />}
              onClick={() => navigate(`/tournament/${id}/vote`)}>
              Meine Votes
            </Button>
          </Group>
          {drafts && drafts.length > 0 && (
            <Stack gap="xs">
              <Text size="sm" c="dimmed" tt="uppercase" fw={500}>Drafts</Text>
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
  return (
    <Stack gap="xs">
      <Card withBorder p="sm"><Group justify="space-between"><Text c="dimmed" size="sm">Spieler</Text><Text fw={600}>{tournament.player_count}</Text></Group></Card>
      <Card withBorder p="sm"><Group justify="space-between"><Text c="dimmed" size="sm">Cubes</Text><Text fw={600}>{tournament.cube_count}</Text></Group></Card>
      <Card withBorder p="sm"><Group justify="space-between"><Text c="dimmed" size="sm">Max Drafts</Text><Text fw={600}>{tournament.max_rounds}</Text></Group></Card>
    </Stack>
  );
}
