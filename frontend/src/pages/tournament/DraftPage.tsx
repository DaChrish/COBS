import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ActionIcon, Alert, Button, Container, Title, Text, Stack, Card, Group, Center, Loader, FileInput, Badge, Image, SimpleGrid } from "@mantine/core";
import { IconUpload, IconChevronLeft, IconChevronRight, IconTrophy, IconTrash, IconCamera } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";
import { useWebSocket } from "../../hooks/useWebSocket";
import { apiFetch } from "../../api/client";
import { Timer } from "../../components/Timer";
import { MatchCard } from "../../components/MatchCard";
import { MatchReportModal } from "../../components/MatchReportModal";
import { PhotoViewer } from "../../components/PhotoViewer";
import type { Draft, Match, PhotoItem, TournamentDetail } from "../../api/types";

type PhotoMap = Record<"POOL" | "DECK" | "RETURNED", PhotoItem[]>;
const EMPTY_PHOTOS: PhotoMap = { POOL: [], DECK: [], RETURNED: [] };

export function DraftPage() {
  const { id, round } = useParams<{ id: string; round: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { data: tournament } = useApi<TournamentDetail>(`/tournaments/${id}`);
  const { data: drafts, refetch: refetchDrafts } = useApi<Draft[]>(`/tournaments/${id}/drafts`);
  const draft = drafts?.find((d) => d.round_number === Number(round));
  const { data: matches, refetch: refetchMatches } = useApi<Match[]>(
    draft ? `/tournaments/${id}/drafts/${draft.id}/matches` : null
  );

  useWebSocket(id, (event) => {
    if (["pairings_ready", "match_reported", "timer_update", "draft_created", "status_changed"].includes(event.event)) {
      refetchMatches();
      refetchDrafts();
    }
  });

  const [reportMatch, setReportMatch] = useState<Match | null>(null);
  const [uploading, setUploading] = useState(false);
  const [myPhotos, setMyPhotos] = useState<PhotoMap>(EMPTY_PHOTOS);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);

  // Load existing photos
  useEffect(() => {
    if (!draft) return;
    apiFetch<PhotoMap>(`/tournaments/${id}/drafts/${draft.id}/photos/mine`)
      .then((photos) => setMyPhotos({ POOL: photos.POOL ?? [], DECK: photos.DECK ?? [], RETURNED: photos.RETURNED ?? [] }))
      .catch(() => {});
  }, [id, draft]);

  if (!tournament || !draft) return <Center h="50vh"><Loader /></Center>;

  const myPlayer = tournament.players.find((p) => p.user_id === user?.id);
  const myPod = draft.pods.find((pod) =>
    pod.players.some((pp) => pp.tournament_player_id === myPlayer?.id)
  );
  const isDraftActive = draft.status === "ACTIVE";
  const myMatches = matches?.filter(
    (m) => m.player1_id === myPlayer?.id || m.player2_id === myPlayer?.id
  ) ?? [];

  // Compute stable table number for my matches based on pod offsets
  const tableNumbers: Record<string, number> = {};
  if (draft && matches) {
    let tblOffset = 1;
    for (const p of draft.pods) {
      const maxMatches = Math.floor(p.pod_size / 2);
      const podNonByes = matches.filter((m) => m.pod_id === p.id && !m.is_bye);
      const rounds = [...new Set(podNonByes.map((m) => m.swiss_round))];
      for (const round of rounds) {
        let t = tblOffset;
        for (const m of podNonByes.filter((m) => m.swiss_round === round)) {
          tableNumbers[m.id] = t++;
        }
      }
      tblOffset += maxMatches;
    }
  }

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

  const refreshPhotos = async () => {
    if (!draft) return;
    const photos = await apiFetch<PhotoMap>(`/tournaments/${id}/drafts/${draft.id}/photos/mine`);
    setMyPhotos({ POOL: photos.POOL ?? [], DECK: photos.DECK ?? [], RETURNED: photos.RETURNED ?? [] });
  };

  const handlePhotoUpload = async (files: File[] | null, type: string) => {
    if (!files || files.length === 0 || !draft) return;
    setUploading(true);
    try {
      const token = localStorage.getItem("token");
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/tournaments/${id}/drafts/${draft.id}/photos/${type}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) throw new Error(t("draft.uploadFailed"));
      }
      await refreshPhotos();
    } catch {
      // silently fail for now
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoDelete = async (photoId: string) => {
    if (!draft) return;
    try {
      await apiFetch(`/tournaments/${id}/drafts/${draft.id}/photos/item/${photoId}`, { method: "DELETE" });
      await refreshPhotos();
    } catch {
      // silently fail for now
    }
  };

  return (
    <Container size="sm">
      <Group justify="space-between" mb="md" align="center">
        <Group gap="xs" align="center">
          <ActionIcon variant="subtle" size="lg"
            disabled={!round || Number(round) <= 1}
            onClick={() => navigate(`/tournament/${id}/draft/${Number(round) - 1}`)}>
            <IconChevronLeft size={20} />
          </ActionIcon>
          <Title order={3}>Draft {round}</Title>
          <ActionIcon variant="subtle" size="lg"
            disabled={!drafts || Number(round) >= drafts.length}
            onClick={() => navigate(`/tournament/${id}/draft/${Number(round) + 1}`)}>
            <IconChevronRight size={20} />
          </ActionIcon>
        </Group>
        <Button variant="light" size="sm" leftSection={<IconTrophy size={16} />}
          onClick={() => navigate(`/tournament/${id}/standings`)}>
          {t("draft.standings")}
        </Button>
      </Group>

      {isDraftActive && myMatches.length === 0 && (myPhotos.POOL.length === 0 || myPhotos.DECK.length === 0) && (
        <Alert
          color="yellow"
          icon={<IconCamera size={20} />}
          mb="md"
          title={t("draft.uploadReminderTitle")}
        >
          <Stack gap="xs">
            <Text size="sm">
              {t("draft.uploadReminderBody", {
                missing: [
                  myPhotos.POOL.length === 0 ? "POOL" : null,
                  myPhotos.DECK.length === 0 ? "DECK" : null,
                ].filter(Boolean).join(" + "),
              })}
            </Text>
            <Button
              variant="light"
              color="yellow"
              size="xs"
              leftSection={<IconUpload size={14} />}
              onClick={() => document.getElementById("photos-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              style={{ alignSelf: "flex-start" }}
            >
              {t("draft.uploadReminderAction")}
            </Button>
          </Stack>
        </Alert>
      )}

      {myPod?.timer_ends_at && <Timer endsAt={myPod.timer_ends_at} />}

      {myPod && (() => {
        const tc = tournament.cubes.find((c) => c.cube_name === myPod.cube_name);
        return (
          <Card withBorder mb="md" padding={0} radius="md">
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
              <Text size="sm" c="dimmed" tt="uppercase">{t("draft.yourPod")}</Text>
              <Text fw={600} size="lg">{myPod.cube_name}</Text>
              <Text size="sm" c="dimmed">
                Pod {myPod.pod_number} · Seat {myPod.players.find((p) => p.tournament_player_id === myPlayer?.id)?.seat_number} · {t("dashboard.playerCount", { count: myPod.pod_size })}
              </Text>
              <Group mt="xs" gap="xs">
                {myPod.players.map((pp) => (
                  <Text key={pp.tournament_player_id} size="xs" c="dimmed">
                    {pp.seat_number}. {pp.username}
                  </Text>
                ))}
              </Group>
            </Stack>
          </Card>
        );
      })()}

      <Text fw={500} mb="xs" c="dimmed" size="sm" tt="uppercase">{t("draft.matches")}</Text>
      {myMatches.length > 0 ? (
        <Stack gap="sm" mb="md">
          {(() => {
            const rounds = [...new Set(myMatches.map((m) => m.swiss_round))].sort();
            return rounds.map((round) => {
              const roundMatches = myMatches.filter((m) => m.swiss_round === round);
              return (
                <Stack key={round} gap="xs">
                  {rounds.length > 1 && <Text size="xs" c="dimmed" fw={600}>Swiss {round}</Text>}
                  {roundMatches.map((m) => (
                    <MatchCard key={m.id} match={m} myPlayerId={myPlayer?.id} onReport={setReportMatch} tableNumber={tableNumbers[m.id]}
                      needsCheckoutPhoto={m.swiss_round >= 3 && myPhotos.RETURNED.length === 0} />
                  ))}
                </Stack>
              );
            });
          })()}
        </Stack>
      ) : (
        <Card withBorder mb="md" padding="md" radius="md" bg="var(--mantine-color-blue-light)">
          <Group gap="xs" align="center">
            <Loader size="xs" />
            <Text size="sm">{t("draft.waitingForPairings")}</Text>
          </Group>
        </Card>
      )}

      <Text id="photos-section" fw={500} mb="xs" c="dimmed" size="sm" tt="uppercase">{t("draft.photos")}</Text>
      <Stack gap="xs">
        {(["POOL", "DECK", "RETURNED"] as const).map((type) => {
          const items = myPhotos[type];
          const count = items.length;
          return (
            <Card key={type} withBorder padding="sm" radius="md">
              <Stack gap="xs">
                <Group gap="xs" align="center">
                  <Text size="sm" fw={500}>{type}</Text>
                  {type === "RETURNED" && (
                    <Text size="xs" c="dimmed">{t("draft.afterLastRound")}</Text>
                  )}
                  {count > 0 ? (
                    <Badge color="green" size="xs" variant="light">{count}</Badge>
                  ) : (
                    <Badge color="gray" size="xs" variant="light">{t("common.missing")}</Badge>
                  )}
                </Group>
                {isDraftActive && (
                  <FileInput
                    size="md"
                    multiple
                    value={[]}
                    clearable={false}
                    placeholder={count > 0 ? t("draft.addMore") : t("draft.upload")}
                    accept="image/*"
                    leftSection={<IconUpload size={18} />}
                    onChange={(f) => handlePhotoUpload(f, type)}
                    disabled={uploading}
                  />
                )}
              </Stack>
              {count > 0 && (
                <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs" mt="xs">
                  {items.map((item) => (
                    <div key={item.id} style={{ position: "relative" }}>
                      <Image
                        src={`/api${item.url}`}
                        radius="md"
                        fit="cover"
                        h={120}
                        style={{ cursor: "pointer" }}
                        onClick={() => setFullscreenPhoto(`/api${item.url}`)}
                      />
                      {isDraftActive && (
                        <ActionIcon
                          size="sm"
                          variant="filled"
                          color="dark"
                          opacity={0.75}
                          style={{ position: "absolute", top: 4, right: 4 }}
                          onClick={() => handlePhotoDelete(item.id)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      )}
                    </div>
                  ))}
                </SimpleGrid>
              )}
            </Card>
          );
        })}
      </Stack>

      <PhotoViewer src={fullscreenPhoto} onClose={() => setFullscreenPhoto(null)} />

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
