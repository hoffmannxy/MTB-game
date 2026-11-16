import * as THREE from 'three';
import { buildWorld, TRACK_LENGTH, trackYaw, centerX } from './world.js';
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

buildWorld(scene);
const bike = new Bike(scene);

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
  finTime: $('fin-time'), finScore: $('fin-score'), finBest: $('fin-best'), hud: $('hud'), touch: $('touch'),
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* egal */ } },
};

let state = 'title';     // title | ride | finish | paused
let time = 0, score = 0;
let trickTimer = 0;

function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function show(el, on) { el.classList.toggle('hidden', !on); }

function startRun() {
  bike.reset(0, true);
  time = 0; score = 0;
  state = 'ride';
  show(ui.title, false); show(ui.finish, false); show(ui.pause, false); show(ui.crash, false);
  show(ui.hud, true);
  camInit = false;
}

function respawn() {
  const z = Math.min(0, bike.pos.z + 6);
  bike.reset(z);
  bike.yaw = trackYaw(z);
  show(ui.crash, false);
}

function finishRun() {
  state = 'finish';
  const best = parseFloat(store.get('mtb-best') || '0');
  const isBest = !best || time < best;
  if (isBest) store.set('mtb-best', String(time));
  const bestScore = parseInt(store.get('mtb-best-score') || '0', 10);
  if (score > bestScore) store.set('mtb-best-score', String(score));
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
  el.addEventListener('touchend', (e) => { touchTap(); e.preventDefault(); }, { passive: false });
}
$('btn-pause')?.addEventListener('click', () => { if (state === 'ride') { state = 'paused'; show(ui.pause, true); } });

// ---------- Kamera ----------
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camInit = false;
function updateCamera(dt) {
  const f = bike.forward(new THREE.Vector3());
  const target = bike.pos.clone().addScaledVector(f, -5.6);
  target.y = Math.max(target.y, bike.pos.y) + 2.8;
  const look = bike.pos.clone().addScaledVector(f, 4).add(new THREE.Vector3(0, 0.9, 0));
  if (!camInit) { camPos.copy(target); camLook.copy(look); camInit = true; }
  const k = 1 - Math.exp(-(bike.crashed ? 2 : 6) * dt);
  camPos.lerp(target, k);
  camLook.lerp(look, 1 - Math.exp(-10 * dt));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

// ---------- Titelbild: langsame Kamerafahrt ----------
let titleT = 0;
function titleCamera(dt) {
  titleT += dt;
  const z = -20 - titleT * 3 % 300;
  const x = centerX(z);
  bike.reset(0, true);
  camera.position.set(x + Math.sin(titleT * 0.3) * 8, bike.pos.y + 4, 8);
  camera.lookAt(bike.pos.x, bike.pos.y + 0.8, bike.pos.z);
}

// ---------- Schleife ----------
const STEP = 1 / 120;
let acc = 0, last = performance.now();

function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.1) dt = 0.1;
  const inp = pollInput();

  // Controller-Status
  const src = input.padName ? `🎮 Controller verbunden` : (input.source === 'touch' ? '👆 Touch-Steuerung' : '🎮 Kein Controller – drück eine Taste am Controller');
  if (ui.padStatus.textContent !== src) ui.padStatus.textContent = src;
  document.body.classList.toggle('show-touch', input.source === 'touch' || (!input.padName && 'ontouchstart' in window));

  if (state === 'title') {
    titleCamera(dt);
    if (inp.aPressed) startRun();
  } else if (state === 'paused') {
    if (inp.aPressed || inp.menuPressed) { state = 'ride'; show(ui.pause, false); }
    else if (inp.yPressed) { show(ui.pause, false); startRun(); }
  } else if (state === 'finish') {
    acc += dt;
    while (acc >= STEP) { bike.step(STEP, { steer: 0, lean: 0, rx: 0, ry: 0, throttle: 0, brake: 0.6, trick: false }); acc -= STEP; }
    updateCamera(dt);
    if (inp.aPressed) startRun();
  } else if (state === 'ride') {
    if (inp.menuPressed) { state = 'paused'; show(ui.pause, true); }
    acc += dt;
    while (acc >= STEP) { bike.step(STEP, inp); acc -= STEP; }
    if (!bike.crashed) time += dt;

    for (const e of bike.events) {
      if (e.type === 'trick') { score += e.points; showTrick(e.text, e.points); }
      if (e.type === 'crash') {
        ui.crashText.textContent = e.text;
        show(ui.crash, true);
      }
    }
    bike.events.length = 0;

    if (bike.crashed) {
      ui.crashHint.style.opacity = bike.crashT > 0.8 ? 1 : 0;
      if (bike.crashT > 0.8 && (inp.aPressed || inp.yPressed)) respawn();
    } else if (inp.yPressed) respawn();

    if (-bike.pos.z >= TRACK_LENGTH) finishRun();
    // weit neben der Strecke oder unter die Welt gefallen
    if (bike.pos.y < -TRACK_LENGTH * 0.3 - 200) respawn();

    updateCamera(dt);

    ui.time.textContent = fmt(time);
    ui.speed.textContent = Math.round(bike.speed() * 3.6);
    ui.score.textContent = score.toLocaleString('de-DE');
    ui.progress.style.width = Math.max(0, Math.min(100, (-bike.pos.z / TRACK_LENGTH) * 100)) + '%';
  }

  if (trickTimer > 0) { trickTimer -= dt; if (trickTimer <= 0) show(ui.trick, false); }

  bike.updateVisual(dt);
  sun.position.set(bike.pos.x - 40, bike.pos.y + 80, bike.pos.z + 30);
  sun.target.position.copy(bike.pos); sun.target.updateMatrixWorld();
  renderer.render(scene, camera);
}

// Bestzeit auf dem Titelbild
{
  const best = parseFloat(store.get('mtb-best') || '0');
  if (best) $('title-best').textContent = `Bestzeit: ${fmt(best)}`;
}

requestAnimationFrame(loop);
window.__game = { bike, get state() { return state; }, startRun };
