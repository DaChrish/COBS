"""Fetch cube metadata from CubeCobra API."""

import logging
import httpx

logger = logging.getLogger(__name__)


async def fetch_cubecobra_metadata(cubecobra_id: str) -> dict:
    """Fetch cube metadata from CubeCobra.

    Returns dict with keys: name, image_url, artist, description (cubecobra link), short_id
    Raises ValueError if fetch fails.
    """
    url = f"https://cubecobra.com/cube/api/cubemetadata/{cubecobra_id}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url)

    if resp.status_code != 200:
        raise ValueError(f"CubeCobra API returned {resp.status_code}")

    data = resp.json()
    if data.get("success") != "true" or "cube" not in data:
        raise ValueError("Invalid CubeCobra response")

    cube = data["cube"]
    name = cube.get("name", "Unknown Cube")
    short_id = cube.get("shortId") or cubecobra_id
    image = cube.get("image", {})
    image_url = image.get("uri")
    artist = image.get("artist")
    description = f"https://cubecobra.com/cube/overview/{short_id}"
    card_count = cube.get("cardCount", 0)
    max_players = card_count // 45 if card_count > 0 else None

    logger.info("Fetched CubeCobra metadata: %s (%s)", name, cubecobra_id)

    return {
        "name": name,
        "image_url": image_url,
        "artist": artist,
        "description": description,
        "short_id": short_id,
        "card_count": card_count,
        "max_players": max_players,
    }
