// Welt: Strecke, Gelände, Bäume. Alles ist eine Höhenfunktion h(x, z).
// Die Strecke läuft bergab in Richtung -z. s = -z ist die Streckenposition in Metern.
import * as THREE from 'three';

export const TRACK_LENGTH = 1400;      // Meter bis zum Ziel
export const TRACK_HALF = 3.5;         // halbe Streckenbreite
const BLEND_END = 9;                   // ab hier reines Gelände
const SLOPE = 0.14;                    // Grundgefälle

// ---------- Zufall & Rauschen (mit Seed, damit die Strecke immer gleich ist) ----------
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
function noise1(s) {
  const i = Math.floor(s), f = smooth(s - i);
  const a = hash2(i, 7), b = hash2(i + 1, 7);
  return a + (b - a) * f;
}

// ---------- Streckenverlauf ----------
export function centerX(z) {
  const s = -z;
  const fade = Math.min(1, Math.max(0, s / 60));        // Start gerade
  return fade * (22 * Math.sin(s / 90) + 11 * Math.sin(s / 37 + 1.3) + 5 * Math.sin(s / 19));
}
export function centerDX(z) {                          // Ableitung dx/dz (numerisch)
  return (centerX(z + 0.5) - centerX(z - 0.5));
}
// Richtung der Strecke als Yaw (0 = geradeaus nach -z)
// Vorwärts = (sin(yaw), 0, -cos(yaw)); die Strecke zeigt in Richtung (-dx/dz, -1)
export function trackYaw(z) {
  return Math.atan2(-centerDX(z), 1);
}

// ---------- Hindernisse ----------
// Typen: table (Tabletop-Sprung), drop (Absatz), rollers (Wellen)
export const features = [];
(function buildFeatures() {
  const rnd = mulberry32(20261116);
  let s = 90;
  const pattern = ['table', 'rollers', 'table', 'drop', 'table', 'table', 'rollers', 'drop'];
  let pi = 0;
  while (s < TRACK_LENGTH - 80) {
    const kind = pattern[pi++ % pattern.length];
    const r = kind === 'table' ? 0 : kind === 'drop' ? 0.6 : 0.9;
    if (r < 0.5) {
      const H = 1.2 + rnd() * 1.8;
      features.push({ type: 'table', s0: s, H, Lk: H * (5.5 + rnd() * 1.5), G: 5 + rnd() * 6, Ll: 18 + rnd() * 6 });
    } else if (r < 0.75) {
      features.push({ type: 'drop', s0: s, D: 1.2 + rnd() * 1.6 });
    } else {
      features.push({ type: 'rollers', s0: s, n: 4 + Math.floor(rnd() * 3), A: 0.45 + rnd() * 0.35, W: 6 + rnd() * 3 });
    }
    s += 60 + rnd() * 40;
  }
})();

function featureHeight(s) {
  let h = 0;
  for (const f of features) {
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

function trackBase(z) {
  const s = -z;
  return z * SLOPE + (noise1(s / 70) - 0.5) * 6;
}

// Senkrechter Abstand zur Mittellinie (Näherung)
export function trackDist(x, z) {
  const dx = centerDX(z);
  return Math.abs(x - centerX(z)) / Math.sqrt(1 + dx * dx);
}

export function height(x, z) {
  const d = trackDist(x, z);
  const base = trackBase(z);
  let w;
  if (d <= TRACK_HALF) w = 1;
  else if (d >= BLEND_END) w = 0;
  else w = 1 - smooth((d - TRACK_HALF) / (BLEND_END - TRACK_HALF));
  const s = -z;
  const feat = s > 0 ? featureHeight(s) : 0;
  const valley = 0.07 * Math.max(0, d - 5);
  const ramp = Math.min(1, Math.max(0, (d - 6) / 30));
  const terr = valley + (noise2(x / 45, z / 45) * 9 + noise2(x / 14, z / 14) * 2.5 - 5.75) * ramp;
  return base + w * feat + (1 - w) * terr;
}

export function normalAt(x, z, out = new THREE.Vector3()) {
  const e = 0.25;
  const hx = height(x + e, z) - height(x - e, z);
  const hz = height(x, z + e) - height(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}

export function onTrack(x, z) { return trackDist(x, z) <= TRACK_HALF + 0.6; }

// ---------- Bäume (für Kollision) ----------
export const trees = [];
const treeGrid = new Map();
(function placeTrees() {
  const rnd = mulberry32(42);
  for (let i = 0; i < 2600; i++) {
    const z = 30 - rnd() * (TRACK_LENGTH + 100);
    const x = centerX(z) + (rnd() * 2 - 1) * 105;
    const d = trackDist(x, z);
    if (d < 10.5) continue;
    if (-z < 20 && d < 16) continue;
    const scale = 0.8 + rnd() * 0.9;
    const t = { x, z, y: height(x, z), scale, rot: rnd() * 6.28 };
    trees.push(t);
    const key = Math.floor(z / 10);
    if (!treeGrid.has(key)) treeGrid.set(key, []);
    treeGrid.get(key).push(t);
  }
})();

export function treeNear(x, z, r) {
  const k = Math.floor(z / 10);
  for (let kk = k - 1; kk <= k + 1; kk++) {
    const list = treeGrid.get(kk);
    if (!list) continue;
    for (const t of list) {
      const dx = t.x - x, dz = t.z - z;
      if (dx * dx + dz * dz < r * r) return t;
    }
  }
  return null;
}

// ---------- Meshes ----------
export function buildWorld(scene) {
  const tmpC = new THREE.Color();

  // Gelände (grob)
  {
    const step = 4, xMin = -125, xMax = 125, zMax = 50, zMin = -(TRACK_LENGTH + 120);
    const nx = Math.round((xMax - xMin) / step) + 1;
    const nz = Math.round((zMax - zMin) / step) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) {
      const z = zMax - j * step;
      const cx = centerX(z);
      for (let i = 0; i < nx; i++) {
        const x = cx + xMin + i * step;
        const d = trackDist(x, z);
        let y = height(x, z);
        if (d < 6.5) y -= 0.35; else if (d < 9.5) y -= 0.35 * (9.5 - d) / 3;
        const k = (j * nx + i) * 3;
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
        const n = noise2(x / 9, z / 9);
        tmpC.setRGB(0.22 + n * 0.12, 0.46 + n * 0.14, 0.18 + n * 0.06);
        col[k] = tmpC.r; col[k + 1] = tmpC.g; col[k + 2] = tmpC.b;
      }
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    scene.add(m);
  }

  // Strecke (fein) als Band entlang der Mittellinie
  {
    const ds = 0.5, us = [-10, -8, -6.5, -5, -3.8, -2.5, -1.2, 0, 1.2, 2.5, 3.8, 5, 6.5, 8, 10];
    const nU = us.length, nS = Math.round((TRACK_LENGTH + 60) / ds) + 1;
    const pos = new Float32Array(nU * nS * 3), col = new Float32Array(nU * nS * 3);
    for (let j = 0; j < nS; j++) {
      const z = 20 - j * ds;
      const cx = centerX(z), dx = centerDX(z), n = Math.sqrt(1 + dx * dx);
      for (let i = 0; i < nU; i++) {
        const u = us[i];
        const x = cx + u / n, zz = z - (u * dx) / n;
        const k = (j * nU + i) * 3;
        pos[k] = x; pos[k + 1] = height(x, zz) + 0.03; pos[k + 2] = zz;
        const au = Math.abs(u);
        const nz = noise2(x * 1.3, zz * 1.3);
        if (au <= TRACK_HALF) tmpC.setRGB(0.55 + nz * 0.1, 0.40 + nz * 0.08, 0.26 + nz * 0.05);
        else {
          const t = Math.min(1, (au - TRACK_HALF) / 2.5);
          const nn = noise2(x / 9, zz / 9);
          tmpC.setRGB(0.55 * (1 - t) + (0.22 + nn * 0.12) * t, 0.40 * (1 - t) + (0.46 + nn * 0.14) * t, 0.26 * (1 - t) + (0.18 + nn * 0.06) * t);
        }
        col[k] = tmpC.r; col[k + 1] = tmpC.g; col[k + 2] = tmpC.b;
      }
    }
    const idx = [];
    for (let j = 0; j < nS - 1; j++) for (let i = 0; i < nU - 1; i++) {
      const a = j * nU + i, b = a + 1, c = a + nU, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  // Bäume (Instanzen)
  {
    const trunkG = new THREE.CylinderGeometry(0.18, 0.25, 1.6, 5); trunkG.translate(0, 0.8, 0);
    const leafG = new THREE.ConeGeometry(1.4, 4.2, 6); leafG.translate(0, 3.6, 0);
    const leafG2 = new THREE.ConeGeometry(1.0, 2.8, 6); leafG2.translate(0, 5.3, 0);
    const trunk = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x5a3b22 }), trees.length);
    const leaf = new THREE.InstancedMesh(leafG, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), trees.length);
    const leaf2 = new THREE.InstancedMesh(leafG2, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), trees.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    trees.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rot);
      sc.setScalar(t.scale);
      p.set(t.x, t.y - 0.2, t.z);
      m4.compose(p, q, sc);
      trunk.setMatrixAt(i, m4); leaf.setMatrixAt(i, m4); leaf2.setMatrixAt(i, m4);
      const g = 0.75 + hash2(i, 3) * 0.5;
      tmpC.setRGB(0.10 * g, 0.36 * g, 0.16 * g);
      leaf.setColorAt(i, tmpC); leaf2.setColorAt(i, tmpC);
    });
    scene.add(trunk, leaf, leaf2);
  }

  // Start- und Zieltor
  scene.add(makeGate(0, 0xf2c94c, 'START'));
  scene.add(makeGate(-TRACK_LENGTH, 0xeb5757, 'ZIEL'));

  // Fähnchen an den Absprüngen, damit man sie früh sieht
  {
    const poleG = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 4); poleG.translate(0, 0.8, 0);
    const flagG = new THREE.PlaneGeometry(0.6, 0.4); flagG.translate(0.3, 1.4, 0);
    const poleM = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
    const flagM = new THREE.MeshLambertMaterial({ color: 0xff7a00, side: THREE.DoubleSide });
    for (const f of features) {
      if (f.type === 'rollers') continue;
      const s = f.s0 - (f.type === 'table' ? f.Lk : 2);
      const z = -s, cx = centerX(z), dx = centerDX(z), n = Math.sqrt(1 + dx * dx);
      for (const side of [-1, 1]) {
        const u = side * (TRACK_HALF + 0.4);
        const x = cx + u / n, zz = z - (u * dx) / n;
        const g = new THREE.Group();
        g.add(new THREE.Mesh(poleG, poleM), new THREE.Mesh(flagG, flagM));
        g.position.set(x, height(x, zz), zz);
        scene.add(g);
      }
    }
  }
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

function makeGate(z, color, text) {
  const g = new THREE.Group();
  const cx = centerX(z), y = height(cx, z);
  const postG = new THREE.BoxGeometry(0.3, 4, 0.3); postG.translate(0, 2, 0);
  const m = new THREE.MeshLambertMaterial({ color });
  const w = TRACK_HALF + 1;
  const p1 = new THREE.Mesh(postG, m); p1.position.set(-w, 0, 0);
  const p2 = new THREE.Mesh(postG, m); p2.position.set(w, 0, 0);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(2 * w, 1.1), new THREE.MeshBasicMaterial({ map: makeTextTexture(text, color), side: THREE.DoubleSide }));
  banner.position.set(0, 3.6, 0);
  g.add(p1, p2, banner);
  g.position.set(cx, y, z);
  g.rotation.y = Math.atan2(centerDX(z), 1);
  return g;
}
