// Welt: Strecke, Gelände, Bäume. Alles hängt an einer Höhenfunktion h(x, z).
// Die Strecke ist eine beliebige Linie (auch Spitzkehren). s = Meter ab Start.
import * as THREE from 'three';

export const TRACK_HALF = 3.5;     // halbe Streckenbreite
const BLEND_END = 9;               // ab hier reines Gelände
const LEAD = 25;                   // gerader Anlauf vor dem Start
const RUNOUT = 60;                 // Auslauf hinter dem Ziel
const CELL = 8;                    // Rastergröße für die Suche
const GRID = 4;                    // Geländeraster

// ---------- Zufall & Rauschen ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
function noise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = smooth(x - xi), zf = smooth(z - zi);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return (a + (b - a) * xf) + ((c + (d - c) * xf) - (a + (b - a) * xf)) * zf;
}

// ---------- Aktuelle Strecke ----------
export const track = {
  def: null, length: 0,
  n: 0, px: null, pz: null, py: null, tx: null, tz: null, kap: null,
  features: [], cells: new Map(),
  terrain: null, tMinX: 0, tMinZ: 0, tNX: 0, tNZ: 0,
  trees: [], treeCells: new Map(),
};

// --- Linie glätten und gleichmäßig in 1-m-Schritten abtasten ---
function resample(pts, step) {
  const out = [pts[0].slice()];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    let d = step - carry;
    while (d <= len) {
      const t = d / len;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      d += step;
    }
    carry = len - (d - step);
  }
  const last = pts[pts.length - 1];
  if (Math.hypot(last[0] - out[out.length - 1][0], last[1] - out[out.length - 1][1]) > step * 0.3) out.push(last.slice());
  return out;
}
function smoothPts(pts, w, comp) {       // gleitender Mittelwert, Enden fest
  const n = pts.length, out = pts.map((p) => p.slice());
  for (let i = 1; i < n - 1; i++) {
    const r = Math.min(w, i, n - 1 - i);
    for (const c of comp) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += pts[i + k][c];
      out[i][c] = s / (2 * r + 1);
    }
  }
  return out;
}
function curvatures(pts) {
  const n = pts.length, k = new Float32Array(n);
  for (let i = 1; i < n - 1; i++) {
    const ax = pts[i][0] - pts[i - 1][0], az = pts[i][1] - pts[i - 1][1];
    const bx = pts[i + 1][0] - pts[i][0], bz = pts[i + 1][1] - pts[i][1];
    const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
    const cross = (ax * bz - az * bx) / (la * lb);
    k[i] = (2 * cross) / (la + lb);
  }
  return k;
}

export function setTrack(def) {
  track.def = def;
  let pts = def.points.map((p) => p.slice());

  // so drehen, dass die Strecke grob nach -z (vom Betrachter weg) läuft
  const first = pts[0], last = pts[pts.length - 1];
  const ang = Math.atan2(last[0] - first[0], -(last[1] - first[1]));
  const ca = Math.cos(ang), sa = Math.sin(ang);
  pts = pts.map(([x, z, y]) => [(x - first[0]) * ca - (z - first[1]) * sa, (x - first[0]) * sa + (z - first[1]) * ca, y]);

  // gleichmäßig abtasten und glätten
  pts = resample(pts, 1);
  pts = smoothPts(pts, def.smooth, [0, 1]);
  pts = resample(pts, 1);
  // engste Kurven aufweiten
  for (let it = 0; it < 80; it++) {
    const k = curvatures(pts);
    let bad = false;
    const out = pts.map((p) => p.slice());
    for (let i = 2; i < pts.length - 2; i++) {
      if (Math.abs(k[i]) > 1 / def.minRadius) {
        bad = true;
        for (let j = Math.max(1, i - 3); j <= Math.min(pts.length - 2, i + 3); j++) {
          out[j][0] = (pts[j - 1][0] + pts[j][0] + pts[j + 1][0]) / 3;
          out[j][1] = (pts[j - 1][1] + pts[j][1] + pts[j + 1][1]) / 3;
        }
      }
    }
    pts = resample(out, 1);
    if (!bad) break;
  }
  pts = smoothPts(pts, def.heightSmooth, [2]);
  // Mindestgefälle, damit man nicht stehen bleibt
  if (def.minSlope) for (let i = 1; i < pts.length; i++) pts[i][2] = Math.min(pts[i][2], pts[i - 1][2] - def.minSlope);
  const y0 = pts[0][2];
  for (const p of pts) p[2] -= y0;

  const L = pts.length - 1;
  // Anlauf und Auslauf gerade verlängern
  const dir = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  const d0 = dir(pts[0], pts[Math.min(8, L)]);
  const d1 = dir(pts[Math.max(0, L - 8)], pts[L]);
  const lead = [];
  for (let i = LEAD; i >= 1; i--) lead.push([pts[0][0] - d0[0] * i, pts[0][1] - d0[1] * i, pts[0][2] + i * 0.06]);
  const tail = [];
  for (let i = 1; i <= RUNOUT; i++) tail.push([pts[L][0] + d1[0] * i, pts[L][1] + d1[1] * i, pts[L][2] - Math.min(i, 20) * 0.04]);
  const all = lead.concat(pts, tail);

  const n = all.length;
  track.n = n; track.length = L;
  track.px = new Float32Array(n); track.pz = new Float32Array(n); track.py = new Float32Array(n);
  track.tx = new Float32Array(n); track.tz = new Float32Array(n);
  all.forEach((p, i) => { track.px[i] = p[0]; track.pz[i] = p[1]; track.py[i] = p[2]; });
  for (let i = 0; i < n; i++) {
    const a = all[Math.max(0, i - 1)], b = all[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    track.tx[i] = dx / l; track.tz[i] = dz / l;
  }
  // Krümmung (geglättet) für Anlieger
  const k = curvatures(all);
  const ks = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let j = -6; j <= 6; j++) { const q = i + j; if (q >= 0 && q < n) { s += k[q]; c++; } }
    ks[i] = s / c;
  }
  track.kap = ks;

  // Suchraster
  track.cells = new Map();
  for (let i = 0; i < n; i++) {
    const key = cellKey(Math.floor(track.px[i] / CELL), Math.floor(track.pz[i] / CELL));
    if (!track.cells.has(key)) track.cells.set(key, []);
    track.cells.get(key).push(i);
  }

  buildFeatures(def);
  buildTerrainField();
  placeTrees();
}

const cellKey = (cx, cz) => cx * 65536 + cz;

// ---------- Hindernisse ----------
function buildFeatures(def) {
  const f = def.features, rnd = mulberry32(def.id.length * 977 + 13);
  track.features = [];
  const kAt = (s) => Math.abs(track.kap[Math.max(0, Math.min(track.n - 1, Math.round(s) + LEAD))]);
  const straightEnough = (a, b) => { for (let s = a; s <= b; s += 2) if (kAt(s) > 1 / 30) return false; return true; };
  let s = f.start, pi = 0;
  while (s < track.length - 45) {
    const kind = f.pattern[pi % f.pattern.length];
    const sz = f.size;
    let feat;
    if (kind === 'table') {
      const H = (1.2 + rnd() * 1.6) * sz;
      feat = { type: 'table', s0: s, H, Lk: H * (5.5 + rnd() * 1.5), G: (5 + rnd() * 5) * sz, Ll: 18 + rnd() * 5 };
    } else if (kind === 'drop') feat = { type: 'drop', s0: s, D: (1.2 + rnd() * 1.2) * sz };
    else feat = { type: 'rollers', s0: s, n: 4 + Math.floor(rnd() * 3), A: 0.45 + rnd() * 0.3, W: 6 + rnd() * 2 };
    const a = feat.type === 'table' ? s - feat.Lk - 5 : feat.type === 'drop' ? s - 20 : s - 3;
    const b = feat.type === 'table' ? s + feat.G + feat.Ll + 5 : feat.type === 'drop' ? s + 20 : s + feat.n * feat.W + 3;
    if (b < track.length - 5 && straightEnough(a, b)) {
      track.features.push(feat);
      pi++;
      s = b + f.gap[0] * 0.5 + rnd() * (f.gap[1] - f.gap[0]) * 0.5;
    } else s += 5;      // in Kurven keine Sprünge – etwas weiter versuchen
  }
}

function featureHeight(s) {
  let h = 0;
  for (const f of track.features) {
    if (f.type === 'table') {
      const a = f.s0 - f.Lk, b = f.s0 + f.G, c = b + f.Ll;
      if (s > a && s <= f.s0) { const t = (s - a) / f.Lk; h += f.H * t * t; }
      else if (s > f.s0 && s <= b) h += f.H;
      else if (s > b && s < c) { const t = (s - b) / f.Ll; h += f.H * (0.5 + 0.5 * Math.cos(t * Math.PI)); }
    } else if (f.type === 'drop') {
      const a = f.s0 - 18;
      if (s > a && s <= f.s0) { const t = (s - a) / 18; h += f.D * smooth(Math.min(1, t * 1.6)); }
      else if (s > f.s0 && s < f.s0 + 0.6) h += f.D * (1 - (s - f.s0) / 0.6);
    } else {
      const len = f.n * f.W;
      if (s > f.s0 && s < f.s0 + len) h += f.A * (0.5 - 0.5 * Math.cos(((s - f.s0) / f.W) * Math.PI * 2));
    }
  }
  return h;
}

// ---------- Nächste Streckenpunkte ----------
// Liefert bis zu zwei Treffer (z. B. beide Äste einer Spitzkehre) mit s, Seitenabstand u, Abstand d
const hitA = { i: -1, d2: 1e9 }, hitB = { i: -1, d2: 1e9 };
function scanNear(x, z, R) {
  hitA.i = -1; hitA.d2 = 1e9; hitB.i = -1; hitB.d2 = 1e9;
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), r = Math.ceil(R / CELL);
  const R2 = R * R;
  for (let a = cx - r; a <= cx + r; a++) for (let b = cz - r; b <= cz + r; b++) {
    const list = track.cells.get(cellKey(a, b));
    if (!list) continue;
    for (const i of list) {
      const dx = track.px[i] - x, dz = track.pz[i] - z, d2 = dx * dx + dz * dz;
      if (d2 > R2) continue;
      if (d2 < hitA.d2) {
        if (hitA.i >= 0 && Math.abs(hitA.i - i) > 30 && hitA.d2 < hitB.d2) { hitB.i = hitA.i; hitB.d2 = hitA.d2; }
        hitA.i = i; hitA.d2 = d2;
      } else if (Math.abs(hitA.i - i) > 30 && d2 < hitB.d2) { hitB.i = i; hitB.d2 = d2; }
    }
  }
  if (hitB.i >= 0 && Math.abs(hitB.i - hitA.i) <= 30) hitB.i = -1;
}
function refine(i, x, z, out) {
  // auf die beiden angrenzenden Segmente projizieren
  let best = 1e9;
  for (const j of [i - 1, i]) {
    if (j < 0 || j >= track.n - 1) continue;
    const ax = track.px[j], az = track.pz[j];
    const sx = track.px[j + 1] - ax, sz = track.pz[j + 1] - az;
    const l2 = sx * sx + sz * sz || 1;
    let t = ((x - ax) * sx + (z - az) * sz) / l2;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + sx * t, qz = az + sz * t;
    const d2 = (x - qx) * (x - qx) + (z - qz) * (z - qz);
    if (d2 < best) {
      best = d2;
      const tx = track.tx[j] + (track.tx[j + 1] - track.tx[j]) * t, tz = track.tz[j] + (track.tz[j + 1] - track.tz[j]) * t;
      // u > 0 = rechts in Fahrtrichtung
      out.u = (x - qx) * -tz + (z - qz) * tx;
      out.d = Math.sqrt(d2);
      out.idx = j + t;
    }
  }
  return out;
}
const near1 = { u: 0, d: 0, idx: 0 }, near2 = { u: 0, d: 0, idx: 0 };

function interp(arr, idx) {
  const i = Math.max(0, Math.min(track.n - 2, Math.floor(idx))), t = Math.min(1, Math.max(0, idx - i));
  return arr[i] + (arr[i + 1] - arr[i]) * t;
}

// Höhe der Strecke an einem Treffer (inkl. Hindernisse und Anlieger)
function trackSurface(hit) {
  const s = hit.idx - LEAD;
  let y = interp(track.py, hit.idx);
  if (s > 0 && s < track.length) y += featureHeight(s);
  // Anlieger: Außenseite der Kurve höher (u>0 = rechts; Linkskurve -> rechts höher)
  // k > 0 = Rechtskurve -> links (u < 0) ist außen und wird angehoben
  const k = interp(track.kap, hit.idx);
  const bank = Math.max(-0.65, Math.min(0.65, -k * track.def.bank * 1.7));
  let uu = Math.max(-7, Math.min(7, hit.u));
  if (uu * k > 0) uu = Math.max(-TRACK_HALF, Math.min(TRACK_HALF, uu));   // Innenseite nicht absenken
  y += bank * uu;
  return y;
}
function weightAt(d) {
  if (d <= TRACK_HALF) return 1;
  if (d >= BLEND_END) return 0;
  return 1 - smooth((d - TRACK_HALF) / (BLEND_END - TRACK_HALF));
}

// ---------- Gelände abseits der Strecke (vorberechnet) ----------
function buildTerrainField() {
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < track.n; i++) {
    minX = Math.min(minX, track.px[i]); maxX = Math.max(maxX, track.px[i]);
    minZ = Math.min(minZ, track.pz[i]); maxZ = Math.max(maxZ, track.pz[i]);
  }
  const M = 120;
  track.tMinX = Math.floor((minX - M) / GRID) * GRID; track.tMinZ = Math.floor((minZ - M) / GRID) * GRID;
  track.tNX = Math.ceil((maxX + M - track.tMinX) / GRID) + 1;
  track.tNZ = Math.ceil((maxZ + M - track.tMinZ) / GRID) + 1;
  const NX = track.tNX, NZ = track.tNZ;
  const base = new Float32Array(NX * NZ), dmin = new Float32Array(NX * NZ);
  const stride = 3;
  for (let j = 0; j < NZ; j++) {
    const z = track.tMinZ + j * GRID;
    for (let i = 0; i < NX; i++) {
      const x = track.tMinX + i * GRID;
      let ws = 0, ys = 0, best = 1e18;
      for (let q = 0; q < track.n; q += stride) {
        const dx = track.px[q] - x, dz = track.pz[q] - z, d2 = dx * dx + dz * dz;
        if (d2 < best) best = d2;
        const w = 1 / (d2 + 36);
        const w2 = w * w;
        ws += w2; ys += w2 * track.py[q];
      }
      const d = Math.sqrt(best);
      base[j * NX + i] = ys / ws + 0.07 * Math.max(0, d - 6);
      dmin[j * NX + i] = d;
    }
  }
  track.terrain = base; track.terrainD = dmin;
}
function bilinear(arr, x, z) {
  const fx = (x - track.tMinX) / GRID, fz = (z - track.tMinZ) / GRID;
  const i = Math.max(0, Math.min(track.tNX - 2, Math.floor(fx))), j = Math.max(0, Math.min(track.tNZ - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - i)), tz = Math.max(0, Math.min(1, fz - j));
  const NX = track.tNX;
  const a = arr[j * NX + i], b = arr[j * NX + i + 1], c = arr[(j + 1) * NX + i], d = arr[(j + 1) * NX + i + 1];
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
}
function terrainHeight(x, z) {
  const d = bilinear(track.terrainD, x, z);
  const ramp = Math.min(1, Math.max(0, (d - 8) / 30));
  return bilinear(track.terrain, x, z) + (noise2(x / 45, z / 45) * 9 + noise2(x / 14, z / 14) * 2.5 - 5.75) * ramp;
}

// ---------- Öffentliche Abfragen ----------
export function height(x, z) {
  scanNear(x, z, BLEND_END + 1.5);
  const terr = terrainHeight(x, z);
  if (hitA.i < 0) return terr;
  refine(hitA.i, x, z, near1);
  const w1 = weightAt(near1.d);
  let w2 = 0;
  if (hitB.i >= 0) { refine(hitB.i, x, z, near2); w2 = weightAt(near2.d); }
  if (w1 + w2 <= 0) return terr;
  const y1 = trackSurface(near1);
  const ty = w2 > 0 ? (w1 * y1 + w2 * trackSurface(near2)) / (w1 + w2) : y1;
  const w = Math.max(w1, w2);
  return w * ty + (1 - w) * terr;
}

export function normalAt(x, z, out = new THREE.Vector3()) {
  const e = 0.25;
  const hx = height(x + e, z) - height(x - e, z);
  const hz = height(x, z + e) - height(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}

// Wo auf der Strecke bin ich? (s in Metern, d = Abstand zur Mitte)
export function locate(x, z) {
  scanNear(x, z, 40);
  if (hitA.i < 0) return { s: -1e9, d: 1e9 };
  refine(hitA.i, x, z, near1);
  return { s: near1.idx - LEAD, d: near1.d };
}
export function onTrack(x, z) {
  scanNear(x, z, TRACK_HALF + 2);
  if (hitA.i < 0) return false;
  refine(hitA.i, x, z, near1);
  return near1.d <= TRACK_HALF + 0.6;
}
// Punkt auf der Mittellinie bei s
export function pointAt(s) {
  const idx = Math.max(0, Math.min(track.n - 1.001, s + LEAD));
  const x = interp(track.px, idx), z = interp(track.pz, idx);
  const tx = interp(track.tx, idx), tz = interp(track.tz, idx);
  return { x, z, y: height(x, z), yaw: Math.atan2(tx, -tz) };
}

// ---------- Bäume ----------
function placeTrees() {
  track.trees = []; track.treeCells = new Map();
  const rnd = mulberry32(42 + track.def.id.length);
  const w = track.tNX * GRID, d = track.tNZ * GRID;
  const count = Math.min(3200, Math.round(w * d * 0.0065));
  for (let i = 0; i < count; i++) {
    const x = track.tMinX + rnd() * w, z = track.tMinZ + rnd() * d;
    scanNear(x, z, 13);
    if (hitA.i >= 0) {
      refine(hitA.i, x, z, near1);
      if (near1.d < 10.5) continue;
      if (hitA.i < LEAD + 15 && near1.d < 15) continue;
    }
    const t = { x, z, y: height(x, z), scale: 0.8 + rnd() * 0.9, rot: rnd() * 6.28 };
    track.trees.push(t);
    const key = cellKey(Math.floor(x / 10), Math.floor(z / 10));
    if (!track.treeCells.has(key)) track.treeCells.set(key, []);
    track.treeCells.get(key).push(t);
  }
}

export function treeNear(x, z, r) {
  const cx = Math.floor(x / 10), cz = Math.floor(z / 10);
  for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) {
    const list = track.treeCells.get(cellKey(a, b));
    if (!list) continue;
    for (const t of list) {
      const dx = t.x - x, dz = t.z - z;
      if (dx * dx + dz * dz < r * r) return t;
    }
  }
  return null;
}

// ---------- Meshes ----------
export function buildWorld() {
  const group = new THREE.Group();
  const tmpC = new THREE.Color();
  const grass = (x, z) => { const n = noise2(x / 9, z / 9); return [0.22 + n * 0.12, 0.46 + n * 0.14, 0.18 + n * 0.06]; };

  // Gelände
  {
    const NX = track.tNX, NZ = track.tNZ;
    const pos = new Float32Array(NX * NZ * 3), col = new Float32Array(NX * NZ * 3);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const x = track.tMinX + i * GRID, z = track.tMinZ + j * GRID;
      let y = height(x, z);
      const dd = track.terrainD[j * NX + i];
      if (dd < 7.5) {
        scanNear(x, z, 9);
        if (hitA.i >= 0) {
          refine(hitA.i, x, z, near1);
          if (near1.d < 6) y -= 0.35; else if (near1.d < 8.5) y -= 0.35 * (8.5 - near1.d) / 2.5;
        }
      }
      const k = (j * NX + i) * 3;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      const g = grass(x, z);
      col[k] = g[0]; col[k + 1] = g[1]; col[k + 2] = g[2];
    }
    const idx = [];
    for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
      const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1;
      idx.push(a, c, b, b, c, d);     // z wächst mit j -> diese Reihenfolge zeigt nach oben
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  // Strecke als feines Band
  {
    const us = [-7.5, -6, -4.8, -3.6, -2.4, -1.2, 0, 1.2, 2.4, 3.6, 4.8, 6, 7.5];
    const nU = us.length, nS = Math.floor((track.n - 1) * 2) + 1;
    const pos = new Float32Array(nU * nS * 3), col = new Float32Array(nU * nS * 3);
    for (let j = 0; j < nS; j++) {
      const idx = j / 2;
      const cx = interp(track.px, idx), cz = interp(track.pz, idx);
      let tx = interp(track.tx, idx), tz = interp(track.tz, idx);
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      for (let i = 0; i < nU; i++) {
        const u = us[i];
        const x = cx - tz * u, z = cz + tx * u;      // rechts = (-tz, tx)
        const k = (j * nU + i) * 3;
        pos[k] = x; pos[k + 1] = height(x, z) + 0.03; pos[k + 2] = z;
        const au = Math.abs(u), nz = noise2(x * 1.3, z * 1.3);
        const dirt = [0.55 + nz * 0.1, 0.40 + nz * 0.08, 0.26 + nz * 0.05];
        if (au <= TRACK_HALF) tmpC.setRGB(dirt[0], dirt[1], dirt[2]);
        else {
          const t = Math.min(1, (au - TRACK_HALF) / 2.5), g = grass(x, z);
          tmpC.setRGB(dirt[0] * (1 - t) + g[0] * t, dirt[1] * (1 - t) + g[1] * t, dirt[2] * (1 - t) + g[2] * t);
        }
        col[k] = tmpC.r; col[k + 1] = tmpC.g; col[k + 2] = tmpC.b;
      }
    }
    const index = [];
    for (let j = 0; j < nS - 1; j++) for (let i = 0; i < nU - 1; i++) {
      const a = j * nU + i, b = a + 1, c = a + nU, d = c + 1;
      index.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    group.add(new THREE.Mesh(geo, mat));
  }

  // Bäume
  {
    const trees = track.trees;
    const trunkG = new THREE.CylinderGeometry(0.18, 0.25, 1.6, 5); trunkG.translate(0, 0.8, 0);
    const leafG = new THREE.ConeGeometry(1.4, 4.2, 6); leafG.translate(0, 3.6, 0);
    const leafG2 = new THREE.ConeGeometry(1.0, 2.8, 6); leafG2.translate(0, 5.3, 0);
    const trunk = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x5a3b22 }), trees.length);
    const leaf = new THREE.InstancedMesh(leafG, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), trees.length);
    const leaf2 = new THREE.InstancedMesh(leafG2, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), trees.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    trees.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rot); sc.setScalar(t.scale); p.set(t.x, t.y - 0.2, t.z);
      m4.compose(p, q, sc);
      trunk.setMatrixAt(i, m4); leaf.setMatrixAt(i, m4); leaf2.setMatrixAt(i, m4);
      const g = 0.75 + hash2(i, 3) * 0.5;
      tmpC.setRGB(0.10 * g, 0.36 * g, 0.16 * g);
      leaf.setColorAt(i, tmpC); leaf2.setColorAt(i, tmpC);
    });
    group.add(trunk, leaf, leaf2);
  }

  group.add(makeGate(0, 0xf2c94c, 'START'));
  group.add(makeGate(track.length, 0xeb5757, 'ZIEL'));

  // Fähnchen vor Absprüngen
  {
    const poleG = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 4); poleG.translate(0, 0.8, 0);
    const flagG = new THREE.PlaneGeometry(0.6, 0.4); flagG.translate(0.3, 1.4, 0);
    const poleM = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
    const flagM = new THREE.MeshLambertMaterial({ color: 0xff7a00, side: THREE.DoubleSide });
    for (const f of track.features) {
      if (f.type === 'rollers') continue;
      const s = f.s0 - (f.type === 'table' ? f.Lk : 2);
      const idx = s + LEAD;
      const cx = interp(track.px, idx), cz = interp(track.pz, idx), tx = interp(track.tx, idx), tz = interp(track.tz, idx);
      for (const side of [-1, 1]) {
        const u = side * (TRACK_HALF + 0.4);
        const x = cx - tz * u, z = cz + tx * u;
        const g = new THREE.Group();
        g.add(new THREE.Mesh(poleG, poleM), new THREE.Mesh(flagG, flagM));
        g.position.set(x, height(x, z), z);
        group.add(g);
      }
    }
  }
  return group;
}

export function disposeWorld(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (o.material.map) o.material.map.dispose();
      o.material.dispose();
    }
  });
}

function makeTextTexture(text, bg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#' + bg.toString(16).padStart(6, '0'); g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#1b1b1b'; g.font = 'bold 84px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeGate(s, color, text) {
  const g = new THREE.Group();
  const idx = s + LEAD;
  const cx = interp(track.px, idx), cz = interp(track.pz, idx);
  const tx = interp(track.tx, idx), tz = interp(track.tz, idx);
  const y = height(cx, cz);
  const postG = new THREE.BoxGeometry(0.3, 4, 0.3); postG.translate(0, 2, 0);
  const m = new THREE.MeshLambertMaterial({ color });
  const w = TRACK_HALF + 1;
  const p1 = new THREE.Mesh(postG, m); p1.position.set(-w, 0, 0);
  const p2 = new THREE.Mesh(postG, m); p2.position.set(w, 0, 0);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(2 * w, 1.1), new THREE.MeshBasicMaterial({ map: makeTextTexture(text, color), side: THREE.DoubleSide }));
  banner.position.set(0, 3.6, 0);
  g.add(p1, p2, banner);
  g.position.set(cx, y, cz);
  // lokale x-Achse soll quer zur Strecke liegen: rechts = (-tz, tx)
  g.rotation.y = Math.atan2(-tx, -tz);
  return g;
}
