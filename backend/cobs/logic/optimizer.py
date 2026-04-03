"""
OR-Tools CP-SAT optimizer for pod/cube assignment.
Port of optimizer/optimizer_service.py — runs as a direct function call.
"""

import logging
import math
from dataclasses import dataclass, field
from ortools.sat.python import cp_model

logger = logging.getLogger(__name__)


@dataclass
class PlayerInput:
    id: str
    match_points: int
    votes: dict[str, str]  # cube_id -> "DESIRED" | "NEUTRAL" | "AVOID"
    dropped: bool = False
    prior_avoid_count: int = 0


@dataclass
class CubeInput:
    id: str
    max_players: int | None = None


@dataclass
class OptimizerConfig:
    score_want: float = 5.0
    score_avoid: float = -200.0
    score_neutral: float = 0.0
    match_point_penalty_weight: float = 100000.0
    early_round_bonus: float = 3.0
    lower_standing_bonus: float = 0.3
    repeat_avoid_multiplier: float = 4.0
    avoid_penalty_scaling: float = 1.0  # 0=disabled, 1=linear, >1=aggressive
    avoid_penalty_formula: str = "linear"  # "linear", "arccot", "cosine", "none"


@dataclass
class OptimizerResult:
    pods: list[list[str]]
    cube_ids: list[str | None]
    objective: float = 0.0
    status: str = ""
    wall_time: float = 0.0


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

    if formula == "cosine":
        if num_cubes == 0:
            return 1.0
        return max(0.0, min(1.0, (math.cos(avoid_count / num_cubes * math.pi) + 1) / 2))

    # Default: "linear"
    if avoid_count == 0 or scaling == 0:
        return 1.0
    ratio = non_avoid_count / avoid_count
    return min(1.0, ratio ** scaling)


def optimize_pods(
    players: list[PlayerInput],
    cubes: list[CubeInput],
    pod_sizes: list[int],
    round_number: int,
    config: OptimizerConfig | None = None,
    seed: int = 0,
    deterministic: bool = False,
) -> OptimizerResult:
    if config is None:
        config = OptimizerConfig()

    active = [p for p in players if not p.dropped]
    P = len(active)
    K = len(pod_sizes)
    C = len(cubes)

    if P == 0 or K == 0 or C == 0:
        return OptimizerResult(pods=[[] for _ in range(K)], cube_ids=[None] * K)

    model = cp_model.CpModel()

    x = {}
    for p in range(P):
        for k in range(K):
            x[p, k] = model.NewBoolVar(f"x_{p}_{k}")

    y = {}
    for k in range(K):
        for c in range(C):
            y[k, c] = model.NewBoolVar(f"y_{k}_{c}")

    z = {}
    for p in range(P):
        for k in range(K):
            for c in range(C):
                z[p, k, c] = model.NewBoolVar(f"z_{p}_{k}_{c}")
                model.Add(z[p, k, c] <= x[p, k])
                model.Add(z[p, k, c] <= y[k, c])
                model.Add(z[p, k, c] >= x[p, k] + y[k, c] - 1)

    for p in range(P):
        model.Add(sum(x[p, k] for k in range(K)) == 1)

    for k in range(K):
        model.Add(sum(x[p, k] for p in range(P)) == pod_sizes[k])

    for k in range(K):
        model.Add(sum(y[k, c] for c in range(C)) == 1)

    for c in range(C):
        model.Add(sum(y[k, c] for k in range(K)) <= 1)

    for c in range(C):
        if cubes[c].max_players is not None:
            for k in range(K):
                if pod_sizes[k] > cubes[c].max_players:
                    model.Add(y[k, c] == 0)

    objective_terms = []

    # Compute per-player avoid weight based on voting balance
    avoid_weights: dict[str, float] = {}
    for player in active:
        avoid_count = sum(1 for v in player.votes.values() if v == "AVOID")
        num_cubes = len(player.votes)
        non_avoid_count = num_cubes - avoid_count
        weight = _compute_avoid_weight(
            config.avoid_penalty_formula, avoid_count, num_cubes, non_avoid_count, config.avoid_penalty_scaling
        )
        avoid_weights[player.id] = weight
        if weight < 1.0:
            logger.info("  Player %s: %d avoids/%d cubes → weight %.2f (%s)",
                        player.id, avoid_count, num_cubes, weight, config.avoid_penalty_formula)

    sorted_mps = sorted(set(p.match_points for p in active))
    mp_to_rank = {mp: i for i, mp in enumerate(sorted_mps)}
    max_rank = max(len(sorted_mps) - 1, 1)

    for p in range(P):
        player = active[p]
        rank = mp_to_rank[player.match_points]
        pref_mult = 1.0 + config.lower_standing_bonus * (1.0 - rank / max_rank)

        for k in range(K):
            for c in range(C):
                cube_id = cubes[c].id
                vote = player.votes.get(cube_id, "NEUTRAL")

                score = config.score_neutral
                if vote == "DESIRED":
                    score = int(config.score_want * pref_mult)
                elif vote == "AVOID":
                    avoid_mult = config.repeat_avoid_multiplier ** player.prior_avoid_count
                    score = int(config.score_avoid * avoid_mult * avoid_weights[player.id])

                if score != 0:
                    objective_terms.append(score * z[p, k, c])

    if round_number == 1:
        for c in range(C):
            cube = cubes[c]
            bonus = 0
            if config.early_round_bonus > 0:
                avoid_count = sum(1 for p in active if p.votes.get(cube.id) == "AVOID")
                bonus += avoid_count * int(config.early_round_bonus)
            if cube.max_players is not None:
                bonus += int(config.early_round_bonus) * 10
            if bonus > 0:
                for k in range(K):
                    objective_terms.append(bonus * y[k, c])

    max_mp_val = max((p.match_points for p in active), default=0)
    min_mp_val = min((p.match_points for p in active), default=0)

    max_mp = {}
    min_mp = {}
    for k in range(K):
        max_mp[k] = model.NewIntVar(min_mp_val, max_mp_val, f"max_mp_{k}")
        min_mp[k] = model.NewIntVar(min_mp_val, max_mp_val, f"min_mp_{k}")
        for p in range(P):
            model.Add(max_mp[k] >= active[p].match_points).OnlyEnforceIf(x[p, k])
            model.Add(min_mp[k] <= active[p].match_points).OnlyEnforceIf(x[p, k])
        objective_terms.append(int(config.match_point_penalty_weight) * (min_mp[k] - max_mp[k]))

    standard = [k for k in range(K) if pod_sizes[k] == 8]
    even_ns = [k for k in range(K) if pod_sizes[k] != 8 and pod_sizes[k] % 2 == 0]
    odd_ns = [k for k in range(K) if pod_sizes[k] != 8 and pod_sizes[k] % 2 == 1]

    tier_pairs = []
    if odd_ns and even_ns:
        tier_pairs.append((odd_ns, even_ns))
    if odd_ns and standard:
        tier_pairs.append((odd_ns, standard))
    if even_ns and standard:
        tier_pairs.append((even_ns, standard))

    for lower_tier, higher_tier in tier_pairs:
        for p_a in range(P):
            for p_b in range(P):
                if active[p_a].match_points > active[p_b].match_points:
                    for k_low in lower_tier:
                        for k_high in higher_tier:
                            model.AddBoolOr([x[p_a, k_low].Not(), x[p_b, k_high].Not()])

    model.Maximize(sum(objective_terms))

    logger.info("Optimizer: %d players, %d pods %s, %d cubes, round %d, seed %d", P, K, pod_sizes, C, round_number, seed)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 300
    solver.parameters.random_seed = seed % (2**31)  # CP-SAT expects int32
    solver.parameters.num_workers = 1 if deterministic else 0 
    solver.parameters.log_search_progress = True
    solver.parameters.log_to_stdout = False
    solver.log_callback = lambda msg: logger.debug("[CP-SAT] %s", msg)

    status = solver.Solve(model)
    status_name = solver.StatusName(status)

    logger.info("Optimizer finished: status=%s, objective=%.1f, wall_time=%.2fs",
                status_name, solver.ObjectiveValue(), solver.WallTime())

    pods: list[list[str]] = [[] for _ in range(K)]
    cube_assignments: list[str | None] = [None] * K

    for p in range(P):
        for k in range(K):
            if solver.Value(x[p, k]) == 1:
                pods[k].append(active[p].id)

    for k in range(K):
        for c in range(C):
            if solver.Value(y[k, c]) == 1:
                cube_assignments[k] = cubes[c].id

    # Log result summary
    player_map = {p.id: p for p in active}
    total_avoids = 0
    for k in range(K):
        cid = cube_assignments[k]
        pod_players = pods[k]
        votes = []
        for pid in pod_players:
            pl = player_map[pid]
            vote = pl.votes.get(cid, "NEUTRAL") if cid else "?"
            votes.append(vote)
            if vote == "AVOID":
                total_avoids += 1
        d = votes.count("DESIRED")
        n = votes.count("NEUTRAL")
        a = votes.count("AVOID")
        logger.info("  Pod %d: %d players, %dD/%dN/%dA", k + 1, len(pod_players), d, n, a)

    if total_avoids > 0:
        logger.warning("  %d AVOID assignment(s)!", total_avoids)
    else:
        logger.info("  No AVOID assignments")

    return OptimizerResult(
        pods=pods, cube_ids=cube_assignments, objective=solver.ObjectiveValue(),
        status=status_name, wall_time=solver.WallTime(),
    )
