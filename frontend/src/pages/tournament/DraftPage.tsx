import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Container, Title, Text, Stack, Card, Group, Center, Loader, FileInput, Badge, Image } from "@mantine/core";
import { IconUpload } from "@tabler/icons-react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";
import { useWebSocket } from "../../hooks/useWebSocket";
import { apiFetch } from "../../api/client";
import { Timer } from "../../components/Timer";
import { MatchCard } from "../../components/MatchCard";
import { MatchReportModal } from "../../components/MatchReportModal";
import type { Draft, Match, TournamentDetail } from "../../api/types";

export function DraftPage() {
  const { id, round } = useParams<{ id: string; round: string }>();
  const { user } = useAuth();
  const { data: tournament } = useApi<TournamentDetail>(`/tournaments/${id}`);
  const { data: drafts, refetch: refetchDrafts } = useApi<Draft[]>(`/tournaments/${id}/drafts`);
  const draft = drafts?.find((d) => d.round_number === Number(round));
  const { data: matches, refetch: refetchMatches } = useApi<Match[]>(
    draft ? `/tournaments/${id}/drafts/${draft.id}/matches` : null
  );

  useWebSocket(id, (event) => {
    if (["pairings_ready", "match_reported", "timer_update"].includes(event.event)) {
      refetchMatches();
      refetchDrafts();
    }
  });

  const [reportMatch, setReportMatch] = useState<Match | null>(null);
  const [uploading, setUploading] = useState(false);
  const [myPhotos, setMyPhotos] = useState<Record<string, string | null>>({ POOL: null, DECK: null, RETURNED: null });

  // Load existing photos
  useEffect(() => {
    if (!draft) return;
    apiFetch<Record<string, string | null>>(`/tournaments/${id}/drafts/${draft.id}/photos/mine`)
      .then(setMyPhotos)
      .catch(() => {});
  }, [id, draft]);

  if (!tournament || !draft) return <Center h="50vh"><Loader /></Center>;

  const myPlayer = tournament.players.find((p) => p.user_id === user?.id);
  const myPod = draft.pods.find((pod) =>
    pod.players.some((pp) => pp.tournament_player_id === myPlayer?.id)
  );
  const myMatches = matches?.filter(
    (m) => m.player1_id === myPlayer?.id || m.player2_id === myPlayer?.id
  ) ?? [];

  const handleReport = async (myWins: number, oppWins: number) => {
    if (!reportMatch || !myPlayer || !draft) return;
    const isP1 = reportMatch.player1_id === myPlayer.id;
    await apiFetch(`/tournaments/${id}/drafts/${draft.id}/matches/${reportMatch.id}/report`, {
      method: "POST",
      body: JSON.stringify({
        player1_wins: isP1 ? myWins : oppWins,
        player2_wins: isP1 ? oppWins : myWins,
      }),
    });
    refetchMatches();
  };

  const handlePhotoUpload = async (file: File | null, type: string) => {
    if (!file || !draft) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/tournaments/${id}/drafts/${draft.id}/photos/${type}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error("Upload fehlgeschlagen");
      // Refresh photos
      const photos = await apiFetch<Record<string, string | null>>(`/tournaments/${id}/drafts/${draft.id}/photos/mine`);
      setMyPhotos(photos);
    } catch {
      // silently fail for now
    } finally {
      setUploading(false);
    }
  };

  return (
    <Container size="sm">
      <Title order={3} mb="md">Runde {round}</Title>

      {myPod?.timer_ends_at && <Timer endsAt={myPod.timer_ends_at} />}

      {myPod && (
        <Card withBorder mb="md" padding="md" radius="md">
          <Text size="sm" c="dimmed" tt="uppercase">Dein Pod</Text>
          <Text fw={600} size="lg">{myPod.cube_name}</Text>
          <Text size="sm" c="dimmed">
            Pod {myPod.pod_number} · Seat {myPod.players.find((p) => p.tournament_player_id === myPlayer?.id)?.seat_number} · {myPod.pod_size} Spieler
          </Text>
          <Group mt="xs" gap="xs">
            {myPod.players.map((pp) => (
              <Text key={pp.tournament_player_id} size="xs" c="dimmed">
                {pp.seat_number}. {pp.username}
              </Text>
            ))}
          </Group>
        </Card>
      )}

      {myMatches.length > 0 && (
        <>
          <Text fw={500} mb="xs" c="dimmed" size="sm" tt="uppercase">Matches</Text>
          <Stack gap="xs" mb="md">
            {myMatches.map((m) => (
              <MatchCard key={m.id} match={m} myPlayerId={myPlayer?.id} onReport={setReportMatch} />
            ))}
          </Stack>
        </>
      )}

      <Text fw={500} mb="xs" c="dimmed" size="sm" tt="uppercase">Fotos</Text>
      <Stack gap="xs">
        {(["POOL", "DECK", "RETURNED"] as const).map((type) => (
          <Card key={type} withBorder padding="xs" radius="md">
            <Group justify="space-between" align="center">
              <Group gap="xs" align="center">
                <Text size="sm" fw={500} w={80}>{type}</Text>
                {myPhotos[type] ? (
                  <Badge color="green" size="xs" variant="light">Hochgeladen</Badge>
                ) : (
                  <Badge color="gray" size="xs" variant="light">Fehlt</Badge>
                )}
              </Group>
              <FileInput
                size="xs"
                w={200}
                placeholder={myPhotos[type] ? "Ersetzen..." : "Hochladen..."}
                accept="image/*"
                leftSection={<IconUpload size={14} />}
                onChange={(f) => handlePhotoUpload(f, type)}
                disabled={uploading}
              />
            </Group>
            {myPhotos[type] && (
              <Image
                src={`/api${myPhotos[type]}`}
                radius="md"
                fit="contain"
                h={150}
                mt="xs"
              />
            )}
          </Card>
        ))}
      </Stack>

      <MatchReportModal
        opened={!!reportMatch}
        onClose={() => setReportMatch(null)}
        opponentName={
          reportMatch
            ? (reportMatch.player1_id === myPlayer?.id
                ? reportMatch.player2_username
                : reportMatch.player1_username) ?? ""
            : ""
        }
        onSubmit={handleReport}
      />
    </Container>
  );
}
