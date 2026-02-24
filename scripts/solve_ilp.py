#!/usr/bin/env python3
"""
Pod-/Cube-Zuweisung per MILP (HiGHS). Liest JSON von stdin, schreibt BrunswickianResult nach stdout.
Gleiche Formulierung wie optimizedAssignmentILP.ts (x_p_c, y_i_p, z_i_p_c).
"""

import json
import sys
import tempfile
import os

DESIRED_WEIGHT = 2
AVOID_PENALTY = 10

# Lookup wie in brunswikian.ts für Pod-Größen
LOOKUP = {0: (0, 0), 1: (1, 0), 2: (2, 0), 3: (1, 2), 4: (-2, -2), 5: (-1, -2), 6: (-2, 0), 7: (-1, 0)}


def calculate_pod_sizes(player_count: int) -> list[int]:
    num_pods = round(player_count / 8)
    if num_pods <= 0:
        return [player_count]
    sizes = [8] * num_pods
    remainder = player_count % 8
    mod1, mod2 = LOOKUP.get(remainder, (0, 0))
    sizes[0] += mod1
    if num_pods > 1:
        sizes[1] += mod2
    return sizes


def build_lp(players: list, cubes: list, pod_sizes: list) -> str:
    n = len(players)
    K = len(pod_sizes)
    C = len(cubes)
    Ctotal = max(C, K)
    cube_ids = [c["id"] for c in cubes]

    def u(i: int, c: int) -> float:
        if c >= C:
            return 0
        vote = players[i].get("votes", {}).get(cube_ids[c], "NEUTRAL")
        if vote == "DESIRED":
            return DESIRED_WEIGHT
        if vote == "AVOID":
            return -AVOID_PENALTY
        return 0

    # Objektiv: alle Variablen in fester Reihenfolge (x, y, z), damit HiGHS-Spaltenordnung fest ist
    lines = ["Maximize", "  obj:"]
    obj_terms = []
    for p in range(K):
        for c in range(Ctotal):
            obj_terms.append(f" 0 x_{p}_{c}")
    for i in range(n):
        for p in range(K):
            obj_terms.append(f" 0 y_{i}_{p}")
    for i in range(n):
        for p in range(K):
            for c in range(Ctotal):
                coef = u(i, c)
                obj_terms.append(f" {coef} z_{i}_{p}_{c}" if coef >= 0 else f" - {-coef} z_{i}_{p}_{c}")
    obj_line = " +".join(obj_terms).replace(" + -", " -").strip()
    if obj_line.startswith(" +"):
        obj_line = obj_line[1:].strip()
    lines.append("  " + (obj_line or "0"))

    lines.append("Subject To")
    row = 0
    for p in range(K):
        terms = " + ".join(f"x_{p}_{c}" for c in range(Ctotal))
        lines.append(f"  c{row}: {terms} = 1")
        row += 1
    for c in range(C):
        terms = " + ".join(f"x_{p}_{c}" for p in range(K))
        lines.append(f"  c{row}: {terms} <= 1")
        row += 1
    for i in range(n):
        terms = " + ".join(f"y_{i}_{p}" for p in range(K))
        lines.append(f"  c{row}: {terms} = 1")
        row += 1
    for p in range(K):
        terms = " + ".join(f"y_{i}_{p}" for i in range(n))
        lines.append(f"  c{row}: {terms} = {pod_sizes[p]}")
        row += 1
    for i in range(n):
        for p in range(K):
            for c in range(Ctotal):
                lines.append(f"  c{row}: z_{i}_{p}_{c} - x_{p}_{c} <= 0")
                row += 1
                lines.append(f"  c{row}: z_{i}_{p}_{c} - y_{i}_{p} <= 0")
                row += 1
                lines.append(f"  c{row}: z_{i}_{p}_{c} - x_{p}_{c} - y_{i}_{p} >= -1")
                row += 1

    lines.append("Bounds")
    for p in range(K):
        for c in range(Ctotal):
            lines.append(f"  0 <= x_{p}_{c} <= 1")
    for i in range(n):
        for p in range(K):
            lines.append(f"  0 <= y_{i}_{p} <= 1")
    for i in range(n):
        for p in range(K):
            for c in range(Ctotal):
                lines.append(f"  0 <= z_{i}_{p}_{c} <= 1")

    lines.append("Binary")
    binaries = [f"x_{p}_{c}" for p in range(K) for c in range(Ctotal)]
    binaries += [f"y_{i}_{p}" for i in range(n) for p in range(K)]
    binaries += [f"z_{i}_{p}_{c}" for i in range(n) for p in range(K) for c in range(Ctotal)]
    lines.append("  " + " ".join(binaries))
    lines.append("End")
    return "\n".join(lines)


def column_names_in_order(n: int, K: int, Ctotal: int) -> list[str]:
    """Reihenfolge wie im LP (Bounds): x, y, z."""
    names = [f"x_{p}_{c}" for p in range(K) for c in range(Ctotal)]
    names += [f"y_{i}_{p}" for i in range(n) for p in range(K)]
    names += [f"z_{i}_{p}_{c}" for i in range(n) for p in range(K) for c in range(Ctotal)]
    return names


def solution_to_result(players: list, cubes: list, pod_sizes: list, col_value: list, col_names: list, warnings: list) -> dict:
    K = len(pod_sizes)
    C = len(cubes)
    cube_ids = [c["id"] for c in cubes]
    player_ids = [p["id"] for p in players]
    name_to_idx = {name: i for i, name in enumerate(col_names)}

    def get_val(name: str) -> float:
        idx = name_to_idx.get(name, -1)
        return col_value[idx] if 0 <= idx < len(col_value) else 0.0

    cube_id_by_pod = []
    for p in range(K):
        chosen = -1
        for c in range(C):
            if round(get_val(f"x_{p}_{c}")) == 1:
                chosen = c
                break
        cube_id_by_pod.append(cube_ids[chosen] if chosen >= 0 else "")

    pod_player_ids = [[] for _ in range(K)]
    for i in range(n_players := len(players)):
        for p in range(K):
            if round(get_val(f"y_{i}_{p}")) == 1:
                pod_player_ids[p].append(player_ids[i])
                break

    pods = [
        {"podNumber": i + 1, "podSize": pod_sizes[i], "cubeId": cube_id_by_pod[i] or "", "playerIds": pod_player_ids[i] or []}
        for i in range(K)
    ]
    return {"pods": pods, "warnings": warnings}


def main() -> None:
    try:
        inp = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        sys.stderr.write(f"JSON error: {e}\n")
        sys.exit(2)

    players = [p for p in inp.get("players", []) if not p.get("dropped", False)]
    cubes = [c for c in inp.get("cubes", []) if c["id"] not in inp.get("usedCubeIds", [])]

    warnings = []
    if len(players) < 2:
        out = {"pods": [], "warnings": ["Zu wenige aktive Spieler."]}
        json.dump(out, sys.stdout, ensure_ascii=False)
        return

    pod_sizes = calculate_pod_sizes(len(players))
    if not cubes:
        out = {
            "pods": [{"podNumber": i + 1, "podSize": s, "cubeId": "", "playerIds": []} for i, s in enumerate(pod_sizes)],
            "warnings": ["Keine Cubes verfügbar."],
        }
        json.dump(out, sys.stdout, ensure_ascii=False)
        return

    if len(cubes) < len(pod_sizes):
        warnings.append(f"Nur {len(cubes)} Cubes für {len(pod_sizes)} Pods. Einige Pods ohne Cube.")

    lp_str = build_lp(players, cubes, pod_sizes)
    n, K, Ctotal = len(players), len(pod_sizes), max(len(cubes), len(pod_sizes))
    col_names = column_names_in_order(n, K, Ctotal)

    import highspy
    h = highspy.Highs()
    h.setOptionValue("log_to_console", False)
    with tempfile.NamedTemporaryFile(mode="w", suffix=".lp", delete=False) as f:
        f.write(lp_str)
        lp_path = f.name
    try:
        h.readModel(lp_path)
        h.run()
        model_status = h.getModelStatus()
        ok_statuses = (highspy.HighsModelStatus.kOptimal,)
        if model_status not in ok_statuses:
            status_str = str(model_status)
            warnings.append(f"MILP-Status: {status_str}. Fallback auf leere Pods.")
            out = {
                "pods": [{"podNumber": i + 1, "podSize": s, "cubeId": "", "playerIds": []} for i, s in enumerate(pod_sizes)],
                "warnings": warnings,
            }
            json.dump(out, sys.stdout, ensure_ascii=False)
            return

        sol = h.getSolution()
        col_value = list(sol.col_value)
        num_col = h.getNumCol()
        if hasattr(h, "getColName") and num_col > 0:
            raw = h.getColName(0)
            if isinstance(raw, tuple):
                col_names = [h.getColName(i)[1] for i in range(num_col)]
            else:
                col_names = [h.getColName(i) for i in range(num_col)]
        result = solution_to_result(players, cubes, pod_sizes, col_value, col_names, warnings)
        json.dump(result, sys.stdout, ensure_ascii=False)
    finally:
        os.unlink(lp_path)


if __name__ == "__main__":
    main()
