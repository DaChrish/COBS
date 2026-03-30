import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Container, Title, Text, Button, Card, Group, Stack, Center, Loader, ActionIcon, Image, SegmentedControl, Paper } from "@mantine/core";
import { IconThumbUp, IconThumbDown, IconMinus, IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { apiFetch } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import type { Vote, TournamentDetail } from "../../api/types";

type VoteValue = "DESIRED" | "NEUTRAL" | "AVOID";

export function VotePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: tournament } = useApi<TournamentDetail>(`/tournaments/${id}`);
  const { data: initialVotes, loading } = useApi<Vote[]>(`/tournaments/${id}/votes`);
  const [votes, setVotes] = useState<Record<string, VoteValue>>({});
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [cardIndex, setCardIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialVotes) {
      const voteMap: Record<string, VoteValue> = {};
      let allVoted = true;
      for (const v of initialVotes) {
        voteMap[v.tournament_cube_id] = v.vote;
        if (v.vote === "NEUTRAL") allVoted = false;
      }
      setVotes(voteMap);
      // If all cubes already have non-NEUTRAL votes, default to list
      if (allVoted && initialVotes.length > 0) setViewMode("list");
    }
  }, [initialVotes]);

  if (loading || !tournament || !initialVotes) return <Center h="50vh"><Loader /></Center>;

  const cubes = tournament.cubes;
  const currentCube = cubes[cardIndex];

  const setVote = (tcId: string, vote: VoteValue) => {
    setVotes((prev) => ({ ...prev, [tcId]: vote }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/tournaments/${id}/votes`, {
        method: "PUT",
        body: JSON.stringify({
          votes: Object.entries(votes).map(([tournament_cube_id, vote]) => ({ tournament_cube_id, vote })),
        }),
      });
      navigate(`/tournament/${id}`);
    } finally {
      setSaving(false);
    }
  };

  const votedCount = Object.values(votes).filter((v) => v !== "NEUTRAL").length;

  return (
    <Container size="sm">
      <Group justify="space-between" mb="md">
        <Title order={3}>Cube Voting</Title>
        <SegmentedControl size="xs" value={viewMode} onChange={(v) => setViewMode(v as "card" | "list")}
          data={[{ label: "Cards", value: "card" }, { label: "Liste", value: "list" }]} />
      </Group>
      <Text size="sm" c="dimmed" mb="md">{votedCount}/{cubes.length} bewertet</Text>

      {viewMode === "card" && currentCube && (
        <Stack>
          <Card withBorder radius="md" padding={0}>
            {currentCube.cube_image_url && (
              <Image src={currentCube.cube_image_url} height={200} alt={currentCube.cube_name} />
            )}
            {!currentCube.cube_image_url && (
              <Center h={200} bg="var(--mantine-color-dark-6)">
                <Text size="xl" c="dimmed">No Image</Text>
              </Center>
            )}
            <Stack p="md" gap="xs">
              <Text fw={600} size="lg">{currentCube.cube_name}</Text>
              {currentCube.cube_description?.startsWith("http") ? (
                <Text size="sm" c="dimmed" component="a" href={currentCube.cube_description} target="_blank" style={{ textDecoration: "underline" }}>
                  {currentCube.cube_description}
                </Text>
              ) : (
                <Text size="sm" c="dimmed">{currentCube.cube_description}</Text>
              )}
            </Stack>
            <Group grow p="md" pt={0}>
              <VoteButton icon={<IconThumbDown />} color="red" label="Avoid"
                active={votes[currentCube.id] === "AVOID"} onClick={() => setVote(currentCube.id, "AVOID")} />
              <VoteButton icon={<IconMinus />} color="gray" label="Neutral"
                active={votes[currentCube.id] === "NEUTRAL"} onClick={() => setVote(currentCube.id, "NEUTRAL")} />
              <VoteButton icon={<IconThumbUp />} color="green" label="Desired"
                active={votes[currentCube.id] === "DESIRED"} onClick={() => setVote(currentCube.id, "DESIRED")} />
            </Group>
          </Card>
          <Group justify="space-between">
            <ActionIcon variant="subtle" size="lg" disabled={cardIndex === 0}
              onClick={() => setCardIndex((i) => i - 1)}><IconArrowLeft /></ActionIcon>
            <Text size="sm" c="dimmed">{cardIndex + 1} / {cubes.length}</Text>
            <ActionIcon variant="subtle" size="lg" disabled={cardIndex === cubes.length - 1}
              onClick={() => setCardIndex((i) => i + 1)}><IconArrowRight /></ActionIcon>
          </Group>
        </Stack>
      )}

      {viewMode === "list" && (
        <Stack gap="xs">
          {cubes.map((cube) => (
            <Paper key={cube.id} withBorder p="sm" radius="md">
              <Group justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text fw={500} truncate>{cube.cube_name}</Text>
                  {cube.cube_description?.startsWith("http") ? (
                    <Text size="xs" c="dimmed" truncate component="a" href={cube.cube_description} target="_blank" style={{ textDecoration: "underline" }}>
                      {cube.cube_description}
                    </Text>
                  ) : (
                    <Text size="xs" c="dimmed" truncate>{cube.cube_description}</Text>
                  )}
                </div>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon color="red" variant={votes[cube.id] === "AVOID" ? "filled" : "subtle"} size="sm"
                    onClick={() => setVote(cube.id, "AVOID")}><IconThumbDown size={14} /></ActionIcon>
                  <ActionIcon color="gray" variant={votes[cube.id] === "NEUTRAL" ? "filled" : "subtle"} size="sm"
                    onClick={() => setVote(cube.id, "NEUTRAL")}><IconMinus size={14} /></ActionIcon>
                  <ActionIcon color="green" variant={votes[cube.id] === "DESIRED" ? "filled" : "subtle"} size="sm"
                    onClick={() => setVote(cube.id, "DESIRED")}><IconThumbUp size={14} /></ActionIcon>
                </Group>
              </Group>
            </Paper>
          ))}
        </Stack>
      )}

      <Button fullWidth mt="lg" loading={saving} onClick={save}>Votes speichern</Button>
    </Container>
  );
}

function VoteButton({ icon, color, label, active, onClick }: {
  icon: React.ReactNode; color: string; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <Button variant={active ? "filled" : "light"} color={color} onClick={onClick}
      leftSection={icon} size="md">{label}</Button>
  );
}
