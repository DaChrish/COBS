"""WebSocket connection manager for broadcasting tournament events."""

import json
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections per tournament."""

    def __init__(self):
        self.connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, tournament_id: str, websocket: WebSocket):
        await websocket.accept()
        self.connections[tournament_id].append(websocket)

    def disconnect(self, tournament_id: str, websocket: WebSocket):
        self.connections[tournament_id] = [
            ws for ws in self.connections[tournament_id] if ws is not websocket
        ]

    async def broadcast(self, tournament_id: str, event: str, data: dict | None = None):
        """Broadcast an event to all connections for a tournament."""
        message = json.dumps({"event": event, "data": data or {}})
        dead: list[WebSocket] = []
        for ws in self.connections[tournament_id]:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(tournament_id, ws)


manager = ConnectionManager()
