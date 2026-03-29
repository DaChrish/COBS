import { useParams, useNavigate } from "react-router-dom";
import { Button, Container, Group, Title, Table, Badge, Text, Center, Loader, ScrollArea, Tooltip } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";
import type { StandingsEntry, TournamentDetail } from "../../api/types";

export function StandingsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: standings, loading } = useApi<StandingsEntry[]>(`/tournaments/${id}/standings`);
  const { data: tournament } = useApi<TournamentDetail>(`/tournaments/${id}`);

  if (loading) return <Center h="50vh"><Loader /></Center>;

  const myPlayer = tournament?.players.find((p) => p.user_id === user?.id);

  return (
    <Container size="md">
      <Group justify="space-between" mb="md" align="center">
        <Title order={3}>Standings</Title>
        <Button variant="light" size="xs" leftSection={<IconArrowLeft size={14} />}
          onClick={() => navigate(`/tournament/${id}`)}>
          Zurück
        </Button>
      </Group>
      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>#</Table.Th>
              <Table.Th>Spieler</Table.Th>
              <Table.Th ta="right">Punkte</Table.Th>
              <Table.Th ta="right">W-L-D</Table.Th>
              <Table.Th ta="right">
                <Tooltip label="Opponent Match Win % — Durchschnittliche Siegquote deiner Gegner" withArrow>
                  <Text span size="sm" style={{ cursor: "help", textDecoration: "underline dotted" }}>OMW%</Text>
                </Tooltip>
              </Table.Th>
              <Table.Th ta="right">
                <Tooltip label="Game Win % — Deine Einzelspiel-Siegquote (2-0 besser als 2-1)" withArrow>
                  <Text span size="sm" style={{ cursor: "help", textDecoration: "underline dotted" }}>GW%</Text>
                </Tooltip>
              </Table.Th>
              <Table.Th ta="right">
                <Tooltip label="Opponent Game Win % — Durchschnittliche Einzelspiel-Siegquote deiner Gegner" withArrow>
                  <Text span size="sm" style={{ cursor: "help", textDecoration: "underline dotted" }}>OGW%</Text>
                </Tooltip>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {standings?.map((s, i) => (
              <Table.Tr key={s.player_id}
                style={s.player_id === myPlayer?.id ? { background: "var(--mantine-color-blue-light)" } : undefined}>
                <Table.Td>{i + 1}</Table.Td>
                <Table.Td>
                  {s.username}
                  {s.dropped && <Badge color="red" size="xs" ml="xs">Dropped</Badge>}
                </Table.Td>
                <Table.Td ta="right" fw={600}>{s.match_points}</Table.Td>
                <Table.Td ta="right">{s.match_wins}-{s.match_losses}-{s.match_draws}</Table.Td>
                <Table.Td ta="right">{(s.omw_percent * 100).toFixed(1)}%</Table.Td>
                <Table.Td ta="right">{(s.gw_percent * 100).toFixed(1)}%</Table.Td>
                <Table.Td ta="right">{(s.ogw_percent * 100).toFixed(1)}%</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Container>
  );
}
