// Grid Dijkstra. The map is ~500 tiles, so one full search per bunny per repath is cheap.
import { COLS, ROWS } from './config';
import { N } from './world';

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
const SQRT2 = Math.SQRT2;

export class PathField {
  readonly dist = new Float32Array(N);
  readonly prev = new Int32Array(N);
  private heapNode = new Int32Array(N * 8);
  private heapPri = new Float32Array(N * 8);
  private size = 0;

  /**
   * Distances from `start` to every tile.
   * cost[i]  = price of stepping onto tile i (Infinity = impassable).
   * solid[i] = 1 if tile i blocks diagonal squeezing past its corner.
   */
  run(start: number, cost: Float32Array, solid: Uint8Array): this {
    this.dist.fill(Infinity);
    this.prev.fill(-1);
    this.size = 0;
    this.dist[start] = 0;
    this.push(start, 0);
    while (this.size > 0) {
      const pri = this.heapPri[0];
      const node = this.pop();
      if (pri > this.dist[node]) continue;
      const x = node % COLS;
      const y = (node / COLS) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const n = ny * COLS + nx;
        const c = cost[n];
        if (c === Infinity) continue;
        let step = c;
        if (d >= 4) {
          // no cutting corners between two walls
          if (solid[y * COLS + nx] || solid[ny * COLS + x]) continue;
          step = c * SQRT2;
        }
        const nd = pri + step;
        if (nd < this.dist[n]) {
          this.dist[n] = nd;
          this.prev[n] = node;
          this.push(n, nd);
        }
      }
    }
    return this;
  }

  /** Tiles to walk from start (exclusive) to target (inclusive). */
  pathTo(target: number): number[] {
    const out: number[] = [];
    if (this.dist[target] === Infinity) return out;
    for (let n = target; this.prev[n] !== -1; n = this.prev[n]) out.push(n);
    out.reverse();
    return out;
  }

  private push(node: number, pri: number): void {
    let i = this.size++;
    const hn = this.heapNode;
    const hp = this.heapPri;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (hp[parent] <= pri) break;
      hn[i] = hn[parent];
      hp[i] = hp[parent];
      i = parent;
    }
    hn[i] = node;
    hp[i] = pri;
  }

  private pop(): number {
    const hn = this.heapNode;
    const hp = this.heapPri;
    const top = hn[0];
    const lastNode = hn[--this.size];
    const lastPri = hp[this.size];
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && hp[child + 1] < hp[child]) child++;
      if (hp[child] >= lastPri) break;
      hn[i] = hn[child];
      hp[i] = hp[child];
      i = child;
    }
    hn[i] = lastNode;
    hp[i] = lastPri;
    return top;
  }
}
