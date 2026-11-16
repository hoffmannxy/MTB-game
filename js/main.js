import * as THREE from 'three';
import { setTrack, buildWorld, disposeWorld, track, locate, pointAt } from './world.js';
import { TRACKS } from './tracks.js';
import { Bike } from './bike.js';
import { pollInput, setupTouch, touchTap, input } from './input.js';

// ---------- Grundgerüst ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const SKY = 0x9fd3f0;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 60, 210);

const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 260);
scene.add(new THREE.HemisphereLight(0xdff2ff, 0x4a6a35, 1.4));
const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
sun.position.set(-40, 80, 30);
scene.add(sun);

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* egal */ } },
};

// ---------- Strecke laden ----------
let trackIdx = Math.max(0, TRACKS.findIndex((t) => t.id === store.get('mtb-track')));
let worldGroup = null;
let bike = null;
let loadedIdx = -1;

function loadTrack(i) {
  if (worldGroup) { scene.remove(worldGroup); disposeWorld(worldGroup); }
  setTrack(TRACKS[i]);
  worldGroup = buildWorld();
  scene.add(worldGroup);
  if (!bike) bike = new Bike(scene); else bike.reset(0);
  loadedIdx = i;
  window.__game.bike = bike;
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 1.2 ? 80 : 68;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

setupTouch();

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
const ui = {
  title: $('title'), finish: $('finish'), pause: $('pause'), crash: $('crash'),
  time: $('hud-time'), speed: $('hud-speed'), score: $('hud-score'), progress: $('hud-progress-bar'),
  trick: $('trick'), padStatus: $('pad-status'), crashText: $('crash-text'), crashHint: $('crash-hint'),
  finTime: $('fin-time'), finScore: $('fin-score'), finBest: $('fin-best'), finTrack: $('fin-track'), hud: $('hud'),
  trackName: $('track-name'), trackInfo: $('track-info'), titleBest: $('title-best'), trackDots: $('track-dots'),
};

let state = 'title';     // title | ride | finish | paused
let time = 0, score = 0;
let trickTimer = 0;

function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
function show(el, on) { el.classList.toggle('hidden', !on); }
const bestKey = (i) => 'mtb-best-' + TRACKS[i].id;
const scoreKey = (i) => 'mtb-score-' + TRACKS[i].id;

function updateTrackLabel() {
  const t = TRACKS[trackIdx];
  ui.trackName.textContent = t.name;
  ui.trackInfo.textContent = t.info;
  const best = parseFloat(store.get(bestKey(trackIdx)) || '0');
  const hs = parseInt(store.get(scoreKey(trackIdx)) || '0', 10);
  ui.titleBest.textContent = best ? `Bestzeit ${fmt(best)} · Highscore ${hs.toLocaleString('de-DE')}` : 'Noch keine Bestzeit';
  ui.trackDots.innerHTML = TRACKS.map((_, i) => `<i class="${i === trackIdx ? 'on' : ''}"></i>`).join('');
}

let reloadTimer = 0;
function selectTrack(dir) {
  trackIdx = (trackIdx + dir + TRACKS.length) % TRACKS.length;
  store.set('mtb-track', TRACKS[trackIdx].id);
  updateTrackLabel();
  reloadTimer = 0.35;          // erst laden, wenn nicht mehr weitergeblättert wird
}

function startRun() {
  if (loadedIdx !== trackIdx) loadTrack(trackIdx);
  reloadTimer = 0;
  bike.reset(0);
  time = 0; score = 0;
  state = 'ride';
  show(ui.title, false); show(ui.finish, false); show(ui.pause, false); show(ui.crash, false);
  show(ui.hud, true);
  camInit = false;
}

function toTitle() {
  state = 'title';
  show(ui.finish, false); show(ui.pause, false); show(ui.crash, false); show(ui.hud, false);
  updateTrackLabel();
  show(ui.title, true);
}

function respawn() {
  const loc = locate(bike.pos.x, bike.pos.z);
  const s = Math.max(0, Math.min(track.length - 5, (loc.s > -1e8 ? loc.s : lastS) - 6));
  bike.reset(s);
  show(ui.crash, false);
}

function finishRun() {
  state = 'finish';
  const best = parseFloat(store.get(bestKey(trackIdx)) || '0');
  const isBest = !best || time < best;
  if (isBest) store.set(bestKey(trackIdx), String(time));
  const bestScore = parseInt(store.get(scoreKey(trackIdx)) || '0', 10);
  if (score > bestScore) store.set(scoreKey(trackIdx), String(score));
  ui.finTrack.textContent = TRACKS[trackIdx].name;
  ui.finTime.textContent = fmt(time);
  ui.finScore.textContent = score.toLocaleString('de-DE');
  ui.finBest.textContent = isBest ? 'Neue Bestzeit! 🏆' : `Bestzeit: ${fmt(best)}`;
  show(ui.finish, true);
}

function showTrick(text, points) {
  ui.trick.innerHTML = points ? `${text}<span>+${points}</span>` : text;
  ui.trick.classList.remove('pop'); void ui.trick.offsetWidth; ui.trick.classList.add('pop');
  trickTimer = 1.6;
  show(ui.trick, true);
}

// Tippen auf Overlays = "A"
for (const el of [ui.title, ui.finish, ui.pause, ui.crash]) {
  el.addEventListener('click', () => touchTap());
}
for (const [id, dir] of [['track-prev', -1], ['track-next', 1]]) {
  const el = $(id);
  const go = (e) => { e.stopPropagation(); e.preventDefault(); selectTrack(dir); };
  el.addEventListener('click', go);
  el.addEventListener('touchend', go, { passive: false });
}
$('btn-pause')?.addEventListener('click', () => { if (state === 'ride') { state = 'paused'; show(ui.pause, true); } });

// ---------- Kamera ----------
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camInit = false, camYaw = 0, camY = 0;
function updateCamera(dt) {
  // Kamera dreht gedämpft hinterher und federt Höhenänderungen ab
  let dy = bike.yaw - camYaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  if (!camInit) { camYaw = bike.yaw; dy = 0; camY = bike.pos.y; }
  camYaw += dy * (1 - Math.exp(-(bike.crashed ? 1.5 : 4.5) * dt));
  camY += (bike.pos.y - camY) * (1 - Math.exp(-5 * dt));
  const f = new THREE.Vector3(Math.sin(camYaw), 0, -Math.cos(camYaw));
  const target = bike.pos.clone().addScaledVector(f, -5.6);
  target.y = Math.max(camY, bike.pos.y - 1.5) + 2.8;
  const look = bike.pos.clone().addScaledVector(f, 4);
  look.y = camY + 0.9 + (bike.pos.y - camY) * 0.5;
  if (!camInit) { camPos.copy(target); camLook.copy(look); camInit = true; }
  const k = 1 - Math.exp(-(bike.crashed ? 2 : 7) * dt);
  camPos.lerp(target, k);
  camLook.lerp(look, 1 - Math.exp(-9 * dt));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

// Titelbild: Kamera schwenkt langsam um den Start
let titleT = 0;
function titleCamera(dt) {
  titleT += dt;
  bike.reset(0);
  const p = pointAt(0);
  const a = p.yaw + Math.PI + Math.sin(titleT * 0.25) * 0.6;
  camera.position.set(p.x + Math.sin(a) * 8, p.y + 3.5, p.z - Math.cos(a) * 8);
  camera.lookAt(p.x, p.y + 0.8, p.z);
}

// ---------- Schleife ----------
const STEP = 1 / 120;
let acc = 0, last = performance.now();
let navHeld = false;
let lastS = 0;

function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.1) dt = 0.1;
  const inp = pollInput();

  const src = input.padName ? '🎮 Controller verbunden' : (input.source === 'touch' ? '👆 Touch-Steuerung' : '🎮 Kein Controller – drück eine Taste am Controller');
  if (ui.padStatus.textContent !== src) ui.padStatus.textContent = src;
  document.body.classList.toggle('show-touch', input.source === 'touch' || (!input.padName && 'ontouchstart' in window));

  if (state === 'title') {
    if (Math.abs(inp.steer) > 0.6 && !navHeld) { selectTrack(Math.sign(inp.steer)); navHeld = true; }
    if (Math.abs(inp.steer) < 0.3) navHeld = false;
    if (reloadTimer > 0) { reloadTimer -= dt; if (reloadTimer <= 0) loadTrack(trackIdx); }
    titleCamera(dt);
    if (inp.aPressed) startRun();
  } else if (state === 'paused') {
    if (inp.aPressed || inp.menuPressed) { state = 'ride'; show(ui.pause, false); }
    else if (inp.yPressed) { show(ui.pause, false); startRun(); }
    else if (inp.bPressed) toTitle();
  } else if (state === 'finish') {
    acc += dt;
    while (acc >= STEP) { bike.step(STEP, { steer: 0, lean: 0, rx: 0, ry: 0, throttle: 0, brake: 0.6, trick: false }); acc -= STEP; }
    updateCamera(dt);
    if (inp.aPressed) startRun();
    else if (inp.bPressed) toTitle();
  } else if (state === 'ride') {
    if (inp.menuPressed) { state = 'paused'; show(ui.pause, true); }
    acc += dt;
    while (acc >= STEP) { bike.step(STEP, inp); acc -= STEP; }
    if (!bike.crashed) time += dt;

    for (const e of bike.events) {
      if (e.type === 'trick') { score += e.points; showTrick(e.text, e.points); }
      if (e.type === 'crash') { ui.crashText.textContent = e.text; show(ui.crash, true); }
    }
    bike.events.length = 0;

    if (bike.crashed) {
      ui.crashHint.style.opacity = bike.crashT > 0.8 ? 1 : 0;
      if (bike.crashT > 0.8 && (inp.aPressed || inp.yPressed)) respawn();
    } else if (inp.yPressed) respawn();

    const loc = locate(bike.pos.x, bike.pos.z);
    if (loc.s > -1e8) lastS = loc.s;
    if (loc.s >= track.length && loc.d < 12) finishRun();
    if (loc.d > 150) respawn();

    updateCamera(dt);
    ui.time.textContent = fmt(time);
    ui.speed.textContent = Math.round(bike.speed() * 3.6);
    ui.score.textContent = score.toLocaleString('de-DE');
    ui.progress.style.width = Math.max(0, Math.min(100, (lastS / track.length) * 100)) + '%';
  }

  if (trickTimer > 0) { trickTimer -= dt; if (trickTimer <= 0) show(ui.trick, false); }

  document.body.classList.toggle('in-air', state === 'ride' && !bike.grounded && bike.airTime > 0.15 && !bike.crashed);
  bike.updateVisual(dt);
  sun.position.set(bike.pos.x - 40, bike.pos.y + 80, bike.pos.z + 30);
  sun.target.position.copy(bike.pos); sun.target.updateMatrixWorld();
  renderer.render(scene, camera);
}

window.__game = { bike: null, get state() { return state; }, startRun, selectTrack, get trackIdx() { return trackIdx; }, track };
loadTrack(trackIdx);
updateTrackLabel();
requestAnimationFrame(loop);
