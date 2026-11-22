import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

type XY = number;
type Level = {
  w: number;
  h: number;
  wall: Uint8Array;
  goal: Uint8Array;
  box: Uint8Array;
  player: XY;
};
type Solution = { moves: string[]; player: XY } | null;

const DIRS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const MOVES = 'urdl';
const MAX_STATES = 250_000;

function parse(text: string): Level {
  const lines = text.split(/\r?\n/);
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const h = lines.length;
  const w = Math.max(...lines.map(line => line.length));
  const wall = new Uint8Array(w * h);
  const goal = new Uint8Array(w * h);
  const box = new Uint8Array(w * h);
  let player = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = lines[y][x] ?? '#';
      const at = y * w + x;
      wall[at] = c === '#' ? 1 : 0;
      goal[at] = c === '.' || c === '*' || c === '+' ? 1 : 0;
      box[at] = c === '$' || c === '*' ? 1 : 0;
      if (c === '@' || c === '+') player = at;
    }
  }
  return { w, h, wall, goal, box, player };
}

function neighbor(level: Level, at: XY, dir: number): XY {
  const x = at % level.w + DIRS[dir][0];
  const y = Math.floor(at / level.w) + DIRS[dir][1];
  return x < 0 || y < 0 || x >= level.w || y >= level.h ? -1 : y * level.w + x;
}

function walk(level: Level, blocked: Uint8Array, start: XY, target: XY): number[] {
  if (start === target) return [start];
  const size = level.w * level.h;
  const prev = new Int32Array(size).fill(-2);
  const queue = new Int32Array(size);
  let head = 0, tail = 0;
  prev[start] = -1;
  queue[tail++] = start;
  while (head < tail) {
    const at = queue[head++];
    for (let dir = 0; dir < 4; dir++) {
      const next = neighbor(level, at, dir);
      if (next < 0 || blocked[next] || prev[next] !== -2) continue;
      prev[next] = at;
      if (next === target) {
        const path: number[] = [target];
        for (let cur = prev[target]; cur !== -1; cur = prev[cur]) path.push(cur);
        path.reverse();
        return path;
      }
      queue[tail++] = next;
    }
  }
  return [];
}

function reachable(level: Level, blocked: Uint8Array, start: XY, region: Uint8Array): void {
  region.fill(0);
  const queue = new Int32Array(level.w * level.h);
  let head = 0, tail = 0;
  region[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const at = queue[head++];
    for (let dir = 0; dir < 4; dir++) {
      const next = neighbor(level, at, dir);
      if (next >= 0 && !blocked[next] && !region[next]) {
        region[next] = 1;
        queue[tail++] = next;
      }
    }
  }
}

function liveSquares(level: Level): Uint8Array {
  const size = level.w * level.h;
  const live = new Uint8Array(size);
  const queue = new Int32Array(size);
  let head = 0, tail = 0;
  for (let at = 0; at < size; at++) {
    if (level.goal[at]) { live[at] = 1; queue[tail++] = at; }
  }
  while (head < tail) {
    const at = queue[head++];
    for (let dir = 0; dir < 4; dir++) {
      const prev = at - DIRS[dir][0] - DIRS[dir][1] * level.w;
      const before = prev - DIRS[dir][0] - DIRS[dir][1] * level.w;
      if (prev < 0 || before < 0 || prev >= size || before >= size) continue;
      if (level.wall[prev] || level.wall[before] || live[prev]) continue;
      live[prev] = 1;
      queue[tail++] = prev;
    }
  }
  return live;
}

function decompose(level: Level): Level[] | null {
  const size = level.w * level.h;
  const live = liveSquares(level);
  for (let at = 0; at < size; at++) if (level.box[at] && !live[at]) return null;
  const cut = new Uint8Array(size);
  const playerRow = Math.floor(level.player / level.w);
  for (let x = 0; x < level.w; x++) {
    const at = playerRow * level.w + x;
    if (!level.wall[at] && !live[at]) cut[at] = 1;
  }
  const seen = new Uint8Array(size);
  const queue = new Int32Array(size);
  const rooms: { boxes: XY[]; goals: XY[]; first: XY }[] = [];
  for (let seed = 0; seed < size; seed++) {
    if (seen[seed] || level.wall[seed] || cut[seed]) continue;
    const boxes: XY[] = [];
    const goals: XY[] = [];
    let first = size;
    seen[seed] = 1;
    queue[0] = seed;
    let head = 0, tail = 1;
    while (head < tail) {
      const at = queue[head++];
      if (at < first) first = at;
      if (level.box[at]) boxes.push(at);
      if (level.goal[at]) goals.push(at);
      for (let dir = 0; dir < 4; dir++) {
        const next = neighbor(level, at, dir);
        if (next >= 0 && !level.wall[next] && !cut[next] && !seen[next]) {
          seen[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    if (boxes.length) rooms.push({ boxes, goals, first });
  }
  if (!rooms.length || rooms.some(room => room.boxes.length !== room.goals.length)) return null;
  rooms.sort((a, b) => a.first - b.first);
  if (rooms.length === 1) return [level];

  const otherBoxes: XY[] = [];
  for (let at = 0; at < size; at++) if (level.box[at]) otherBoxes.push(at);
  const result: Level[] = [];
  for (const room of rooms) {
    const wall = level.wall.slice();
    const goal = new Uint8Array(size);
    const box = new Uint8Array(size);
    let head = 0, tail = 0;
    queue[tail++] = room.first;
    const inside = new Uint8Array(size);
    inside[room.first] = 1;
    while (head < tail) {
      const at = queue[head++];
      goal[at] = level.goal[at];
      for (let dir = 0; dir < 4; dir++) {
        const next = neighbor(level, at, dir);
        if (next >= 0 && !level.wall[next] && !cut[next] && !inside[next]) {
          inside[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    for (const at of room.boxes) box[at] = 1;
    for (const at of otherBoxes) if (!box[at]) wall[at] = 1;
    result.push({ w: level.w, h: level.h, wall, goal, box, player: level.player });
  }
  return result;
}

type Node = {
  boxes: XY[];
  region: Uint8Array;
  parent: number;
  foot: XY;
  source: XY;
  destination: XY;
};

function solveRoom(level: Level, player: XY): Solution {
  const size = level.w * level.h;
  const startBoxes: XY[] = [];
  for (let at = 0; at < size; at++) if (level.box[at]) startBoxes.push(at);
  startBoxes.sort((a, b) => a - b);
  const count = startBoxes.length;
  const isGoal = (at: XY) => level.goal[at] === 1;

  const obstacles = level.wall.slice();
  const setObstacles = (boxes: XY[]): void => {
    obstacles.set(level.wall);
    for (const box of boxes) obstacles[box] = 1;
  };
  const frozen = (boxes: XY[], at: XY): boolean => {
    const x = at % level.w;
    const y = Math.floor(at / level.w);
    for (let dy = -1; dy <= 0; dy++) {
      for (let dx = -1; dx <= 0; dx++) {
        const cx = x + dx, cy = y + dy;
        if (cx < 0 || cy < 0 || cx + 1 >= level.w || cy + 1 >= level.h) continue;
        const corners = [cy * level.w + cx, cy * level.w + cx + 1,
          (cy + 1) * level.w + cx, (cy + 1) * level.w + cx + 1];
        if (!corners.every(cell => obstacles[cell])) continue;
        if (corners.some(cell => boxes.includes(cell) && !level.goal[cell])) return true;
      }
    }
    return false;
  };

  const live = liveSquares(level);
  const startRegion = new Uint8Array(size);
  setObstacles(startBoxes);
  reachable(level, obstacles, player, startRegion);
  const startKey = `${startBoxes.join(',')}|${startRegion.indexOf(1)}`;
  const nodes: Node[] = [{
    boxes: startBoxes, region: startRegion, parent: -1, foot: -1, source: -1, destination: -1
  }];
  const state = new Map<string, number>([[startKey, 0]]);
  const queue: number[] = [0];
  let head = 0;
  let found = -1;
  const region = new Uint8Array(size);

  while (head < queue.length && nodes.length < MAX_STATES) {
    const index = queue[head++];
    const node = nodes[index];
    if (node.boxes.every(isGoal)) {
      found = index;
      break;
    }
    setObstacles(node.boxes);
    for (let slot = 0; slot < count; slot++) {
      const box = node.boxes[slot];
      for (let dir = 0; dir < 4; dir++) {
        const foot = box - DIRS[dir][0] - DIRS[dir][1] * level.w;
        const next = box + DIRS[dir][0] + DIRS[dir][1] * level.w;
        if (foot < 0 || next < 0 || foot >= size || next >= size) continue;
        if (!node.region[foot] || node.boxes.includes(next) || level.wall[next] || !live[next]) continue;
        const boxes = node.boxes.slice();
        boxes[slot] = next;
        boxes.sort((a, b) => a - b);
        setObstacles(boxes);
        if (frozen(boxes, next)) continue;
        reachable(level, obstacles, box, region);
        const key = `${boxes.join(',')}|${region.indexOf(1)}`;
        if (state.has(key)) continue;
        const child = nodes.length;
        state.set(key, child);
        nodes.push({ boxes, region: region.slice(), parent: index, foot, source: box, destination: next });
        queue.push(child);
        if (boxes.every(isGoal)) {
          found = child;
          head = queue.length;
          break;
        }
      }
      if (found >= 0) break;
    }
  }
  if (found < 0) return null;

  const chain: number[] = [];
  for (let at = found; nodes[at].parent >= 0; at = nodes[at].parent) chain.push(at);
  chain.reverse();
  const moves: string[] = [];
  let position = player;
  const walkBlocked = level.wall.slice();
  for (const box of startBoxes) walkBlocked[box] = 1;
  for (const index of chain) {
    const node = nodes[index];
    const path = walk(level, walkBlocked, position, node.foot);
    if (path[0] !== position || path[path.length - 1] !== node.foot) return null;
    for (let stepIndex = 1; stepIndex < path.length; stepIndex++) {
      const step = path[stepIndex];
      const delta = step - position;
      const dir = delta === -level.w ? 0 : delta === 1 ? 1 : delta === level.w ? 2 : 3;
      moves.push(MOVES[dir]);
      position = step;
    }
    const delta = node.destination - node.source;
    const pushDir = delta === -level.w ? 0 : delta === 1 ? 1 : delta === level.w ? 2 : 3;
    moves.push(MOVES[pushDir].toUpperCase());
    walkBlocked[node.source] = 0;
    walkBlocked[node.destination] = 1;
    position = node.source;
  }
  return { moves, player: position };
}

function solveLevel(text: string): string {
  const level = parse(text);
  const rooms = decompose(level);
  if (!rooms) return '';
  const size = level.w * level.h;
  // Each room's boxes as they stand now: untouched rooms keep their parsed
  // boxes, a solved room has its boxes on its goals. A later room's search
  // must see the other rooms' CURRENT boxes as walls, not where they began.
  const current: XY[][] = rooms.map((room) => {
    const bs: XY[] = [];
    for (let at = 0; at < size; at++) if (room.box[at]) bs.push(at);
    return bs;
  });
  const goalsOf = (room: Level): XY[] => {
    const gs: XY[] = [];
    for (let at = 0; at < size; at++) if (room.goal[at]) gs.push(at);
    return gs;
  };
  let player = level.player;
  const moves: string[] = [];
  for (let k = 0; k < rooms.length; k++) {
    const room = rooms[k];
    const wall = level.wall.slice();
    for (let j = 0; j < rooms.length; j++) {
      if (j === k) continue;
      for (const b of current[j]) wall[b] = 1;
    }
    const sub: Level = { w: level.w, h: level.h, wall, goal: room.goal, box: room.box, player };
    const result = solveRoom(sub, player);
    if (!result) return '';
    moves.push(...result.moves);
    player = result.player;
    current[k] = goalsOf(room);
  }
  return moves.join('');
}

function main(): void {
  for (const id of readdirSync(I).sort()) {
    let moves = '';
    try {
      moves = solveLevel(readFileSync(join(I, id, 'level.txt'), 'utf8'));
    } catch {
      moves = '';
    }
    mkdirSync(join(O, id), { recursive: true });
    writeFileSync(join(O, id, 'solution.txt'), `${moves}\n`);
  }
}
main();
