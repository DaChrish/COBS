import { useEffect, useRef } from "react";

interface WSEvent {
  event: string;
  data: Record<string, unknown>;
}

export function useWebSocket(
  tournamentId: string | undefined,
  onEvent: (event: WSEvent) => void
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!tournamentId) return;

    // No auth needed — WS endpoint accepts without authentication
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/api/ws/tournaments/${tournamentId}`);

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as WSEvent;
        onEventRef.current(parsed);
      } catch { /* ignore parse errors */ }
    };

    return () => {
      ws.close();
    };
  }, [tournamentId]);
}
