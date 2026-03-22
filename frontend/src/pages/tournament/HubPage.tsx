import { useParams, useNavigate } from "react-router-dom";
import { Container, Title, Text, Button, Card, Group, Badge, Stack, Center, Loader, Alert } from "@mantine/core";
import { IconHandFinger, IconCards, IconTrophy } from "@tabler/icons-react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";
import type { TournamentDetail, Draft } from "../../api/types";

const STATUS_COLORS: Record<string, string> = {
  SETUP: "gray", VOTING: "blue", DRAFTING: "orange", FINISHED: "green",
};

export function HubPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: tournament, loading } = useApi<TournamentDetail>(`/tournaments/${id}`);
  const { data: drafts } = useApi<Draft[]>(`/tournaments/${id}/drafts`);

  if (loading || !tournament) return <Center h="50vh"><Loader /></Center>;

  const myPlayer = tournament.players.find((p) => p.user_id === user?.id);
  const latestDraft = drafts?.length ? drafts[drafts.length - 1] : null;
  const myPod = latestDraft?.pods.find((pod) =>
    pod.players.some((pp) => pp.tournament_player_id === myPlayer?.id)
  );

  return (
    <Container size="sm">
      <Group justify="space-between" mb="md">
        <div>
          <Title order={2}>{tournament.name}</Title>
          <Text size="sm" c="dimmed">
            {tournament.player_count} Spieler · {tournament.cube_count} Cubes · {drafts?.length ?? 0}/{tournament.max_rounds} Runden
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

      {tournament.status === "DRAFTING" && latestDraft && (
        <Stack gap="md">
          {myPod && (
            <Card withBorder padding="md" radius="md">
              <Text size="sm" c="dimmed" tt="uppercase">Dein Pod — Runde {latestDraft.round_number}</Text>
              <Text fw={600} size="lg" mt={4}>{myPod.cube_name}</Text>
              <Text size="sm" c="dimmed">
                Pod {myPod.pod_number} · Seat {myPod.players.find(p => p.tournament_player_id === myPlayer?.id)?.seat_number}
              </Text>
            </Card>
          )}
          <Button size="lg" fullWidth leftSection={<IconCards size={20} />}
            onClick={() => navigate(`/tournament/${id}/draft/${latestDraft.round_number}`)}>
            Draft ansehen
          </Button>
          <Group grow>
            <Button variant="light" leftSection={<IconTrophy size={16} />}
              onClick={() => navigate(`/tournament/${id}/standings`)}>
              Standings
            </Button>
          </Group>
        </Stack>
      )}

      {tournament.status === "FINISHED" && (
        <Stack gap="md">
          <Alert color="green" title="Turnier beendet">
            Das Turnier ist abgeschlossen.
          </Alert>
          <Button variant="light" fullWidth leftSection={<IconTrophy size={20} />}
            onClick={() => navigate(`/tournament/${id}/standings`)}>
            Endergebnis ansehen
          </Button>
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
      <Card withBorder p="sm"><Group justify="space-between"><Text c="dimmed" size="sm">Max Runden</Text><Text fw={600}>{tournament.max_rounds}</Text></Group></Card>
    </Stack>
  );
}
