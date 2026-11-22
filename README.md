[![make.fun · sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/ari-exp/sokoban-solver-01-run-20261121/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/ari-exp/sokoban-solver-01-run-20261121/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)

# Push-optimal Sokoban solver

Entry for the make.fun bounty [sokoban-solver-01-run-20261121](https://make.fun/bounty/sokoban-solver-01-run-20261121): one program (`main.ts`, Node 22) that answers all 5 instances of a Sokoban set, in as few pushes as possible.

## How it works

- **Room decomposition.** Every level is a hallway with 1–4 rooms off it. The solver cuts the hallway's dead squares (cells in the player's row from which a box can never reach a goal) out of the floor; each remaining connected component holding boxes is one room. Rooms are independent — a box never leaves its room — so the level's push-optimum is the sum of its rooms' optima.
- **Push BFS per room.** Each room is solved by breadth-first search over *pushes* (not steps), so the first solution found is push-optimal. A state is the sorted box positions plus the player's reachable region (named by its lowest square).
- **Pruning.** Dead squares (reverse pull-reachability from the goals) and frozen 2×2 blocks of walls/boxes with a box off its goal are pruned; neither prunes a solvable state, so optimality stands.
- **Stitching.** Rooms are solved in scan order; each room's search sees the other rooms' *current* box positions as walls (solved rooms: boxes on their goals), and the player's walk carries over between rooms.
- **Deterministic, clock-free.** The search is bounded by a state count (250,000 per room), never by the wall clock, so two runs write identical bytes.

## Practice set results

| Instance | Pushes | P\* | Points |
|----------|--------|-----|--------|
| i001 | 13 | 13 | 1,000 |
| i002 | 16 | 16 | 1,000 |
| i003 | 29 | 29 | 1,000 |
| i004 | 47 | 47 | 1,000 |
| i005 | 60 | 60 | 1,000 |

Practice score: **1,000,000** (verified with the kit's `grade-local`, ~1.8 s for the whole set). The solver also reaches the constructed optimum on 40 freshly generated unseen levels.

## Run

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=<input-dir> MAKEFUN_OUTPUT_DIR=out node main.ts
```

Each instance's answer is written to `out/<id>/solution.txt` as `u`/`d`/`l`/`r` moves (an upper-case letter marks a push).
