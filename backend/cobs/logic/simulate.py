"""Pure simulation logic for test tournaments."""

import io
import random

from PIL import Image, ImageDraw, ImageFont

# Weighted outcomes: (p1_wins, p2_wins) with cumulative weights
_OUTCOMES = [(2, 0), (2, 1), (1, 2), (0, 2)]
_WEIGHTS = [30, 40, 20, 10]


def generate_match_results(
    match_ids: list[str],
    seed: int,
    with_conflicts: bool,
) -> list[dict]:
    """Generate deterministic match results for simulation.

    Uses a seeded RNG so the same inputs always produce the same outputs.
    """
    rng = random.Random(seed)
    results = []

    for match_id in match_ids:
        (p1_wins, p2_wins) = rng.choices(_OUTCOMES, weights=_WEIGHTS, k=1)[0]

        has_conflict = False
        if with_conflicts and rng.random() < 0.2:
            has_conflict = True
            # Player 2 reports the flipped result
            p2_report = {"p1_wins": p2_wins, "p2_wins": p1_wins}
        else:
            p2_report = {"p1_wins": p1_wins, "p2_wins": p2_wins}

        results.append(
            {
                "match_id": match_id,
                "p1_wins": p1_wins,
                "p2_wins": p2_wins,
                "has_conflict": has_conflict,
                "p1_report": {"p1_wins": p1_wins, "p2_wins": p2_wins},
                "p2_report": p2_report,
            }
        )

    return results


_COLORS = {
    "POOL": (46, 125, 50),
    "DECK": (21, 101, 192),
    "RETURNED": (230, 124, 25),
}


def generate_photo_image(
    username: str,
    photo_type: str,
    round_number: int,
) -> bytes:
    """Generate a placeholder JPEG image for simulation photos."""
    bg_color = _COLORS.get(photo_type, (128, 128, 128))
    img = Image.new("RGB", (400, 300), color=bg_color)
    draw = ImageDraw.Draw(img)

    try:
        font_large = ImageFont.truetype("DejaVuSans-Bold.ttf", 28)
        font_small = ImageFont.truetype("DejaVuSans.ttf", 22)
    except OSError:
        font_large = ImageFont.load_default()
        font_small = font_large

    lines = [
        (username, font_large),
        (photo_type, font_small),
        (f"Runde {round_number}", font_small),
    ]

    total_height = sum(draw.textbbox((0, 0), text, font=f)[3] for text, f in lines)
    spacing = 10
    y = (300 - total_height - spacing * (len(lines) - 1)) // 2

    for text, font in lines:
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        x = (400 - text_width) // 2
        draw.text((x, y), text, fill="white", font=font)
        y += bbox[3] + spacing

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return buf.getvalue()
