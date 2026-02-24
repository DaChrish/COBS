from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict
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


class Cube(BaseModel):
    """Represents a game set (cube) that can be played."""
    id: str


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

    # -------------------------------------------------------------------------
    # OBJECTIVE FUNCTION
    # -------------------------------------------------------------------------
    objective_terms = []

    # 1. Player Preferences (WANT/AVOID/NEUTRAL)
    # We add or subtract points based on how a player voted for the cube their pod is playing.
    for p in range(P):
        player = active_players[p]
        for k in range(K):
            for c in range(C):
                cube_id = req.cubes[c].id
                vote = player.votes.get(cube_id, "NEUTRAL")

                score = req.scoreNeutral
                if vote == "DESIRED":
                    score = req.scoreWant
                elif vote == "AVOID":
                    score = req.scoreAvoid

                if score != 0:
                    # z[p,k,c] is 1 if player p plays cube c. We multiply it by their configured score.
                    objective_terms.append(score * z[p, k, c])

    # 2. Early Round Unpopular Bonus
    # To prevent highly AVOIDed cubes from piling up in the final rounds, we apply a bonus 
    # to using them in Round 1.
    if req.roundNumber == 1 and req.earlyRoundBonus > 0:
        for c in range(C):
            cube_id = req.cubes[c].id
            # Count the total number of players globally who avoid this cube
            avoid_count = sum(
                1
                for p in active_players
                if p.votes.get(cube_id, "NEUTRAL") == "AVOID"
            )
            bonus = avoid_count * req.earlyRoundBonus
            if bonus != 0:
                for k in range(K):
                    # If this pod (k) takes this cube (c), add the bonus to the objective
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

    # Set the solver to maximize the sum of all accumulated objective terms
    model.Maximize(sum(objective_terms))

    # -------------------------------------------------------------------------
    # SOLVER EXECUTION
    # -------------------------------------------------------------------------
    solver = cp_model.CpSolver()

    solver.parameters.log_search_progress = True

    # Force the solver to stop after 30 seconds to prevent hanging on overly complex edge cases
    solver.parameters.max_time_in_seconds = 30
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

