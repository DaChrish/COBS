from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from cobs.logic.ws_manager import manager

router = APIRouter()


@router.websocket("/ws/tournaments/{tournament_id}")
async def tournament_ws(websocket: WebSocket, tournament_id: str):
    await manager.connect(tournament_id, websocket)
    try:
        while True:
            # Keep connection alive, ignore client messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(tournament_id, websocket)
