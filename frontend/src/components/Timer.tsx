import { useState, useEffect } from "react";
import { Text, Paper } from "@mantine/core";
import { IconClock } from "@tabler/icons-react";

export function Timer({ endsAt }: { endsAt: string | null }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!endsAt) { setRemaining(null); return; }
    const update = () => {
      const diff = new Date(endsAt).getTime() - Date.now();
      setRemaining(Math.floor(diff / 1000));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (remaining === null) return null;

  const isWarning = remaining <= 300 && remaining > 0;
  const isExpired = remaining <= 0;
  const color = isExpired ? "red" : isWarning ? "orange" : "blue";
  const absSeconds = Math.abs(remaining);
  const minutes = Math.floor(absSeconds / 60);
  const seconds = absSeconds % 60;
  const sign = remaining < 0 ? "-" : "";

  return (
    <Paper p="sm" radius="md" bg={`var(--mantine-color-${color}-light)`} mb="md">
      <Text ta="center" fw={700} size="xl" c={color}>
        <IconClock size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />
        {sign}{minutes}:{seconds.toString().padStart(2, "0")}
      </Text>
    </Paper>
  );
}
