import { useState } from "react";
import { Modal, Stack, Text, Group, ActionIcon, Button } from "@mantine/core";
import { IconPlus, IconMinus } from "@tabler/icons-react";

interface Props {
  opened: boolean;
  onClose: () => void;
  opponentName: string;
  onSubmit: (myWins: number, oppWins: number) => void;
}

export function MatchReportModal({ opened, onClose, opponentName, onSubmit }: Props) {
  const [myWins, setMyWins] = useState(0);
  const [oppWins, setOppWins] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const reset = () => { setMyWins(0); setOppWins(0); setConfirming(false); };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Modal opened={opened} onClose={handleClose} title="Ergebnis melden" centered>
      {!confirming ? (
        <Stack>
          <Text size="sm" c="dimmed">vs. {opponentName}</Text>
          <Counter label="Meine Wins" value={myWins} onChange={setMyWins} />
          <Counter label="Gegner Wins" value={oppWins} onChange={setOppWins} />
          <Button fullWidth onClick={() => setConfirming(true)}
            disabled={myWins === 0 && oppWins === 0}>
            Weiter
          </Button>
        </Stack>
      ) : (
        <Stack>
          <Text ta="center" fw={600} size="lg">{myWins} - {oppWins}</Text>
          <Text ta="center" size="sm" c="dimmed">vs. {opponentName}</Text>
          <Text ta="center" size="sm" c="dimmed">Bist du sicher?</Text>
          <Group grow>
            <Button variant="light" onClick={() => setConfirming(false)}>Zurück</Button>
            <Button color="green" onClick={() => { onSubmit(myWins, oppWins); handleClose(); }}>
              Bestätigen
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Group justify="space-between">
      <Text>{label}</Text>
      <Group gap="xs">
        <ActionIcon variant="light" onClick={() => onChange(Math.max(0, value - 1))} disabled={value === 0}>
          <IconMinus size={16} />
        </ActionIcon>
        <Text fw={700} w={30} ta="center">{value}</Text>
        <ActionIcon variant="light" onClick={() => onChange(value + 1)}>
          <IconPlus size={16} />
        </ActionIcon>
      </Group>
    </Group>
  );
}
