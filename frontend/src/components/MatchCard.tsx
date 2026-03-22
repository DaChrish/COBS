import { Paper, Group, Text, Badge, Button } from "@mantine/core";
import type { Match } from "../api/types";

interface Props {
  match: Match;
  myPlayerId: string | undefined;
  onReport: (match: Match) => void;
}

export function MatchCard({ match, myPlayerId, onReport }: Props) {
  const isP1 = match.player1_id === myPlayerId;
  const isP2 = match.player2_id === myPlayerId;
  const isMyMatch = isP1 || isP2;

  const opponentName = isP1 ? match.player2_username : match.player1_username;

  // Determine if the current player has already reported
  const iReported = isP1
    ? match.p1_reported_p1_wins !== null
    : match.p2_reported_p1_wins !== null;

  if (match.is_bye) {
    return (
      <Paper withBorder p="sm" radius="md">
        <Group justify="space-between">
          <Text size="sm">{match.player1_username}</Text>
          <Badge color="gray">Bye — 3 Punkte</Badge>
        </Group>
      </Paper>
    );
  }

  return (
    <Paper withBorder p="sm" radius="md">
      <Group justify="space-between" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Text size="sm" fw={500}>
            {isMyMatch ? `vs. ${opponentName}` : `${match.player1_username} vs. ${match.player2_username}`}
          </Text>
        </div>
        {match.reported && (
          <Badge color="green">{match.player1_wins}-{match.player2_wins} ✓</Badge>
        )}
        {match.has_conflict && (
          <Badge color="red">Konflikt</Badge>
        )}
        {!match.reported && !match.has_conflict && isMyMatch && !iReported && (
          <Button size="compact-xs" onClick={() => onReport(match)}>Melden</Button>
        )}
        {!match.reported && !match.has_conflict && isMyMatch && iReported && (
          <Badge color="yellow">Warte auf Gegner...</Badge>
        )}
        {!match.reported && !match.has_conflict && !isMyMatch && (
          <Badge color="gray">Ausstehend</Badge>
        )}
      </Group>
    </Paper>
  );
}
