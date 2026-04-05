import { Paper, Group, Text, Badge, Button } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { Match } from "../api/types";

interface Props {
  match: Match;
  myPlayerId: string | undefined;
  onReport: (match: Match) => void;
  tableNumber?: number;
}

export function MatchCard({ match, myPlayerId, onReport, tableNumber }: Props) {
  const { t } = useTranslation();
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
          <Badge color="gray">{t("match.bye")}</Badge>
        </Group>
      </Paper>
    );
  }

  return (
    <Paper withBorder p="sm" radius="md">
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" style={{ minWidth: 0 }}>
          {tableNumber && <Text size="xs" c="dimmed" fw={600}>T{tableNumber}</Text>}
          <Text size="sm" fw={500}>
            {isMyMatch ? `vs. ${opponentName}` : `${match.player1_username} vs. ${match.player2_username}`}
          </Text>
        </Group>
        {match.reported && (
          <Badge color="green">{match.player1_wins}-{match.player2_wins} ✓</Badge>
        )}
        {match.has_conflict && (
          <>
            <Badge color="red">{t("match.conflict")}</Badge>
            <Text size="xs" c="dimmed">{t("match.conflictHint")}</Text>
          </>
        )}
        {!match.reported && !match.has_conflict && isMyMatch && !iReported && (
          <Button size="compact-xs" onClick={() => onReport(match)}>{t("match.report")}</Button>
        )}
        {!match.reported && !match.has_conflict && isMyMatch && iReported && (
          <Badge color="yellow">{t("match.waitingForOpponent")}</Badge>
        )}
        {!match.reported && !match.has_conflict && !isMyMatch && (
          <Badge color="gray">{t("match.pending")}</Badge>
        )}
      </Group>
    </Paper>
  );
}
