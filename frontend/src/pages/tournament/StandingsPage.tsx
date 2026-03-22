import { useParams } from "react-router-dom";
import { Container, Title, Table, Badge, Text, Center, Loader, ScrollArea } from "@mantine/core";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../hooks/useAuth";
import type { StandingsEntry, TournamentDetail } from "../../api/types";

export function StandingsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: standings, loading } = useApi<StandingsEntry[]>(`/tournaments/${id}/standings`);
  const { data: tournament } = useApi<TournamentDetail>(`/tournaments/${id}`);

  if (loading) return <Center h="50vh"><Loader /></Center>;

  const myPlayer = tournament?.players.find((p) => p.user_id === user?.id);

  return (
    <Container size="md">
      <Title order={3} mb="md">Standings</Title>
      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>#</Table.Th>
              <Table.Th>Spieler</Table.Th>
              <Table.Th ta="right">Punkte</Table.Th>
              <Table.Th ta="right">W-L-D</Table.Th>
              <Table.Th ta="right">OMW%</Table.Th>
              <Table.Th ta="right">GW%</Table.Th>
              <Table.Th ta="right">OGW%</Table.Th>
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
