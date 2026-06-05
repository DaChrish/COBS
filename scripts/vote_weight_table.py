"""
Vergleichstabelle der Avoid-Gewichtungs-Formeln.

Die Funktion _compute_avoid_weight ist 1:1 aus
backend/cobs/logic/optimizer.py (Zeilen 50-83) kopiert,
damit die Tabelle garantiert dem echten Code entspricht.
"""

import math


# ---------------------------------------------------------------------------
# 1:1 KOPIE aus backend/cobs/logic/optimizer.py
# ---------------------------------------------------------------------------
def _compute_avoid_weight(
    formula: str, avoid_count: int, num_cubes: int, non_avoid_count: int, scaling: float
) -> float:
    """Compute avoid penalty weight (0-1) based on the chosen formula.

    - "none": always 1.0 (no penalty reduction)
    - "linear": min(1, (non_avoid/avoid) ^ scaling)
    - "arccot": 1 - arccot(((cubes/2 - avoids) / 3)) / pi
    - "cosine": (cos(avoids/cubes * pi) + 1) / 2
    """
    if formula == "none" or avoid_count == 0:
        return 1.0

    if formula == "arccot":
        # arccot(x) = atan(1/x) for x != 0, pi/2 for x = 0
        x = (num_cubes / 2 - avoid_count) / 3
        if x == 0:
            arccot_val = math.pi / 2
        else:
            arccot_val = math.atan(1 / x)
            if arccot_val < 0:
                arccot_val += math.pi
        return max(0.0, min(1.0, 1 - arccot_val / math.pi))

    if formula == "arccot_norm":
        threshold = num_cubes * 0.6
        if threshold == 0:
            return 1.0
        x = threshold - avoid_count
        if x == 0:
            arccot_val = 0.5
        elif x > 0:
            arccot_val = math.atan(1 / x) / math.pi
        else:
            arccot_val = (math.atan(1 / x) + math.pi) / math.pi
        denom = 1 - math.atan(1 / threshold) / math.pi
        if denom == 0:
            return 1.0
        return max(0.0, min(1.0, (1 - arccot_val) / denom))

    if formula == "cosine":
        if num_cubes == 0:
            return 1.0
        return max(0.0, min(1.0, (math.cos(avoid_count / num_cubes * math.pi) + 1) / 2))

    # Default: "linear"
    if avoid_count == 0 or scaling == 0:
        return 1.0
    ratio = non_avoid_count / avoid_count
    return min(1.0, ratio ** scaling)


# ---------------------------------------------------------------------------
# Tabellen-Aufbau
# ---------------------------------------------------------------------------
NUM_CUBES = 26
SCORE_AVOID = -200.0   # config.score_avoid
SCORE_WANT = 5.0       # config.score_want

# Spalten: (Label, formula, scaling)
COLUMNS = [
    ("none", "none", 1.0),
    ("linear", "linear", 1.0),
    ("linear^2", "linear", 2.0),
    ("arccot", "arccot", 1.0),
    ("arccot_norm", "arccot_norm", 1.0),
    ("cosine", "cosine", 1.0),
]

AVOID_COUNTS = [0, 1, 2, 4, 6, 8, 10, 13, 16, 18, 20, 22, 24, 26]


def weight_for(formula: str, scaling: float, avoid_count: int) -> float:
    non_avoid = NUM_CUBES - avoid_count
    return _compute_avoid_weight(formula, avoid_count, NUM_CUBES, non_avoid, scaling)


def print_table(title: str, transform):
    print(title)
    header = f"{'AVOID':>6} |" + "".join(f" {lbl:>8} |" for lbl, _, _ in COLUMNS)
    print(header)
    print("-" * len(header))
    for a in AVOID_COUNTS:
        cells = "".join(
            f" {transform(weight_for(f, s, a)):>8} |" for _, f, s in COLUMNS
        )
        print(f"{a:>6} |{cells}")
    print()


if __name__ == "__main__":
    print(f"NUM_CUBES = {NUM_CUBES}, score_avoid = {SCORE_AVOID}, score_want = {SCORE_WANT}\n")

    print_table(
        "=== Avoid-Gewicht (Faktor 0-1) ===",
        lambda w: f"{w:.2f}",
    )
    print_table(
        "=== Effektiver AVOID-Score (= score_avoid * Gewicht); zum Vergleich WANT = +5 ===",
        lambda w: f"{SCORE_AVOID * w:.0f}",
    )
