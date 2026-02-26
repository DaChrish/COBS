from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict, Optional
from ortools.sat.python import cp_model
import logging

# Configure standard Python logging to track incoming requests and solver status
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Initialize the FastAPI application
app = FastAPI()

# -----------------------------------------------------------------------------
# Data Models
# -----------------------------------------------------------------------------

class Player(BaseModel):
    """Represents a player participating in the tournament."""
    id: str
    matchPoints: int            # Current standing points. Players with similar points should be grouped together.
    votes: Dict[str, str]       # Map of cubeId -> vote ("DESIRED", "NEUTRAL", "AVOID")
    dropped: bool = False       # If True, the player is not participating in this round
    priorAvoidCount: int = 0    # How many times this player was assigned an AVOID cube in previous rounds


class Cube(BaseModel):
    """Represents a game set (cube) that can be played."""
    id: str
    maxPlayers: Optional[int] = None


class OptimizeRequest(BaseModel):
    """Payload received from the TypeScript client to solve a round's pod assignments."""
    players: List[Player]
    cubes: List[Cube]
    podSizes: List[int]         # Pre-calculated sizes for each pod (e.g., [8, 8, 8] for 24 players)
    roundNumber: int            # Current round of the tournament
    earlyRoundBonus: int        # Bonus value to encourage picking unpopular cubes in round 1
    
    # Dynamic scoring parameters to tune the solver's behavior
    scoreWant: int = 5
    scoreAvoid: int = -190
    scoreNeutral: int = 0
    matchPointPenaltyWeight: int = 10000
    lowerStandingBonus: float = 0.3  # Multiplier bonus for lower-standing players' DESIRED votes (0 = disabled)
    repeatAvoidMultiplier: float = 4.0  # AVOID penalty multiplier per prior AVOID assignment (e.g. 4 = 4x after 1st, 16x after 2nd)


# -----------------------------------------------------------------------------
# API Endpoints
# -----------------------------------------------------------------------------

@app.get("/health")
def health():
    """Simple health check endpoint."""
    return {"status": "ok"}


@app.post("/optimize")
def optimize(req: OptimizeRequest):
    """
    Main optimization endpoint using Google OR-Tools (CP-SAT solver).
    It solves a Mixed Integer Linear Programming (MILP) problem to assign:
    - Players to exactly one Pod
    - Pods to exactly one Cube
    while maximizing total player satisfaction and keeping players of similar skill (Match Points) together.
    """
    logger.info(f"Received optimization request for round {req.roundNumber} with {len(req.players)} players and {len(req.cubes)} cubes.")
    
    # Filter out players who have dropped from the tournament
    active_players = [p for p in req.players if not p.dropped]

    P = len(active_players)
    K = len(req.podSizes)
    C = len(req.cubes)

    # Initialize the Constraint Programming model
    model = cp_model.CpModel()

    # -------------------------------------------------------------------------
    # DECISION VARIABLES
    # -------------------------------------------------------------------------

    # x[p, k]: Boolean variable, 1 if Player 'p' is assigned to Pod 'k', otherwise 0.
    x = {}
    for p in range(P):
        for k in range(K):
            x[p, k] = model.NewBoolVar(f"x_{p}_{k}")

    # y[k, c]: Boolean variable, 1 if Pod 'k' is assigned to play Cube 'c', otherwise 0.
    y = {}
    for k in range(K):
        for c in range(C):
            y[k, c] = model.NewBoolVar(f"y_{k}_{c}")

    # z[p, k, c]: Boolean variable representing the logical AND of x[p, k] and y[k, c].
    # It is 1 if Player 'p' is in Pod 'k' AND Pod 'k' plays Cube 'c'. 
    # This is needed to linearize the product x * y so the solver can apply scores.
    z = {}
    for p in range(P):
        for k in range(K):
            for c in range(C):
                z[p, k, c] = model.NewBoolVar(f"z_{p}_{k}_{c}")
                
                # Linearization constraints for z = x AND y:
                # 1. z cannot be 1 if x is 0
                model.Add(z[p, k, c] <= x[p, k])
                # 2. z cannot be 1 if y is 0
                model.Add(z[p, k, c] <= y[k, c])
                # 3. z must be 1 if BOTH x and y are 1
                model.Add(z[p, k, c] >= x[p, k] + y[k, c] - 1)

    # -------------------------------------------------------------------------
    # CONSTRAINTS
    # -------------------------------------------------------------------------

    # Constraint 1: Every player must be assigned to exactly ONE pod.
    for p in range(P):
        model.Add(sum(x[p, k] for k in range(K)) == 1)

    # Constraint 2: Each pod 'k' must contain exactly podSizes[k] players.
    for k in range(K):
        model.Add(sum(x[p, k] for p in range(P)) == req.podSizes[k])

    # Constraint 3: Each pod must be assigned exactly ONE cube.
    for k in range(K):
        model.Add(sum(y[k, c] for c in range(C)) == 1)

    # Constraint 4: A specific cube can be played by AT MOST one pod in a given round.
    # (i.e., we cannot have two pods playing the same cube simultaneously).
    for c in range(C):
        model.Add(sum(y[k, c] for k in range(K)) <= 1)

    # Constraint 5: Enforce Cube maxPlayers capacity.
    # If a cube has a maxPlayers limit (e.g. 8), it can NEVER be assigned to a pod
    # with size > maxPlayers.
    for c in range(C):
        cube = req.cubes[c]
        if cube.maxPlayers is not None:
            for k in range(K):
                if req.podSizes[k] > cube.maxPlayers:
                    # Forbid this pod from playing this cube
                    model.Add(y[k, c] == 0)

    # -------------------------------------------------------------------------
    # OBJECTIVE FUNCTION
    # -------------------------------------------------------------------------
    objective_terms = []

    # 1. Player Preferences (WANT/AVOID/NEUTRAL)
    # We add or subtract points based on how a player voted for the cube their pod is playing.
    #
    # Lower-standing preference bonus: Players with fewer match points get a small
    # multiplier (up to 1.3x) on their DESIRED score. This subtly favors fulfilling
    # cube wishes for weaker players when the solver has multiple equally good options.
    # Only applied to DESIRED — AVOID penalties stay equal for all players.
    sorted_mps = sorted(set(p.matchPoints for p in active_players))
    mp_to_rank = {mp: i for i, mp in enumerate(sorted_mps)}
    max_rank = max(len(sorted_mps) - 1, 1)

    for p in range(P):
        player = active_players[p]
        rank = mp_to_rank[player.matchPoints]  # 0 = weakest, max_rank = strongest
        preference_multiplier = 1.0 + req.lowerStandingBonus * (1.0 - rank / max_rank)

        for k in range(K):
            for c in range(C):
                cube_id = req.cubes[c].id
                vote = player.votes.get(cube_id, "NEUTRAL")

                score = req.scoreNeutral
                if vote == "DESIRED":
                    # Apply the lower-standing bonus only to DESIRED votes
                    score = int(req.scoreWant * preference_multiplier)
                elif vote == "AVOID":
                    # Escalate AVOID penalty for players who already played AVOID cubes
                    # in previous rounds: score = scoreAvoid * multiplier^priorAvoidCount
                    avoid_multiplier = req.repeatAvoidMultiplier ** player.priorAvoidCount
                    score = int(req.scoreAvoid * avoid_multiplier)

                if score != 0:
                    # z[p,k,c] is 1 if player p plays cube c. We multiply it by their configured score.
                    objective_terms.append(score * z[p, k, c])

    # 2. Early Round Unpopular Bonus & Limited Cube Bonus
    # To prevent highly AVOIDed cubes from piling up in the final rounds, we apply a bonus 
    # to using them in Round 1. We also add a small bonus for maxPlayers-limited cubes
    # in Round 1, to encourage using them before pods get fragmented.
    if req.roundNumber == 1:
        for c in range(C):
            cube = req.cubes[c]
            cube_id = cube.id
            bonus = 0
            
            # --- Unpopular bonus ---
            if req.earlyRoundBonus > 0:
                # Count the total number of players globally who avoid this cube
                avoid_count = sum(1 for p in active_players if p.votes.get(cube_id) == "AVOID")
                
                # Apply the bonus linearly: (players_avoiding * earlyRoundBonus)
                # Note: 'y[k,c]' is 1 if Pod 'k' plays Cube 'c'. 
                # We simply add this bonus for whichever pod ends up playing 'c'.
                bonus += avoid_count * req.earlyRoundBonus
            
            # --- Limited cube bonus ---
            if cube.maxPlayers is not None:
                # Give a small constant bonus
                bonus += req.earlyRoundBonus * 10

            if bonus > 0:
                for k in range(K):
                    objective_terms.append(bonus * y[k, c])

    # 3. Match Point Spread Penalty (Skill-based grouping)
    # Players with the same or similar Match Points must be placed in the same pod.
    max_mp_val = max((p.matchPoints for p in active_players), default=0)
    min_mp_val = min((p.matchPoints for p in active_players), default=0)

    max_mp = {}
    min_mp = {}
    
    for k in range(K):
        # Define integer variables to track the maximum and minimum match points inside pod 'k'
        max_mp[k] = model.NewIntVar(min_mp_val, max_mp_val, f"max_mp_{k}")
        min_mp[k] = model.NewIntVar(min_mp_val, max_mp_val, f"min_mp_{k}")
        
        for p in range(P):
            # Enforce that if player 'p' is in pod 'k' (x[p,k] == 1), 
            # the pod's max_mp must be at least the player's MP, and min_mp at most the player's MP.
            model.Add(max_mp[k] >= active_players[p].matchPoints).OnlyEnforceIf(x[p, k])
            model.Add(min_mp[k] <= active_players[p].matchPoints).OnlyEnforceIf(x[p, k])
            
        # Penalize the spread (max_mp - min_mp) heavily.
        # Since we are Maximizing the objective, we add a negative penalty: weight * (min - max).
        objective_terms.append(req.matchPointPenaltyWeight * (min_mp[k] - max_mp[k]))

    # 4. Three-Tier Pod Constraint (Skill-based pod tier assignment)
    # Pod tiers from worst to best experience:
    #   Tier 1 (lowest): Odd-sized non-standard pods (someone must get a bye)
    #   Tier 2 (middle): Even-sized non-standard pods (no bye, but not ideal 8)
    #   Tier 3 (highest): Standard 8-player pods (ideal experience)
    #
    # Constraints ensure: MP(odd non-std player) <= MP(even non-std player) <= MP(std player)
    # When MPs are tied, the solver is free to use cube preferences as the tiebreaker.
    standard_pods = [k for k in range(K) if req.podSizes[k] == 8]
    even_nonstandard_pods = [k for k in range(K) if req.podSizes[k] != 8 and req.podSizes[k] % 2 == 0]
    odd_nonstandard_pods = [k for k in range(K) if req.podSizes[k] != 8 and req.podSizes[k] % 2 == 1]

    # Build tier pairs: (lower_tier_pods, higher_tier_pods)
    # A player with more MP must not be in a lower tier while a player with fewer MP is in a higher tier.
    tier_pairs = []
    if odd_nonstandard_pods and even_nonstandard_pods:
        tier_pairs.append((odd_nonstandard_pods, even_nonstandard_pods))
    if odd_nonstandard_pods and standard_pods:
        tier_pairs.append((odd_nonstandard_pods, standard_pods))
    if even_nonstandard_pods and standard_pods:
        tier_pairs.append((even_nonstandard_pods, standard_pods))

    for lower_tier, higher_tier in tier_pairs:
        for p_a in range(P):
            for p_b in range(P):
                if active_players[p_a].matchPoints > active_players[p_b].matchPoints:
                    # Player A has MORE match points than player B.
                    # A must NOT be in a lower-tier pod while B is in a higher-tier pod.
                    for k_low in lower_tier:
                        for k_high in higher_tier:
                            # Forbid: x[p_a, k_low] == 1 AND x[p_b, k_high] == 1
                            model.AddBoolOr([
                                x[p_a, k_low].Not(),
                                x[p_b, k_high].Not()
                            ])

    # Set the solver to maximize the sum of all accumulated objective terms
    model.Maximize(sum(objective_terms))

    # -------------------------------------------------------------------------
    # SOLVER EXECUTION
    # -------------------------------------------------------------------------
    solver = cp_model.CpSolver()

    solver.parameters.log_search_progress = True

    # Force the solver to stop after 30 seconds to prevent hanging on overly complex edge cases
    solver.parameters.max_time_in_seconds = 300
    solver.Solve(model)

    # -------------------------------------------------------------------------
    # RESULT EXTRACTION
    # -------------------------------------------------------------------------
    pods = [[] for _ in range(K)]
    cube_assignments = [None] * K

    for p in range(P):
        for k in range(K):
            if solver.Value(x[p, k]) == 1:
                pods[k].append(active_players[p].id)

    for k in range(K):
        for c in range(C):
            if solver.Value(y[k, c]) == 1:
                cube_assignments[k] = req.cubes[c].id

    return {
        "pods": pods,
        "cubeIds": cube_assignments,
        "objective": solver.ObjectiveValue(),
    }

