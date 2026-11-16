// Eingabe: Xbox-Controller (Gamepad API), Tastatur und Touch.
// Alles wird auf ein gemeinsames Steuer-Objekt abgebildet.
//
// Belegung wie in Descenders:
//   Linker Stick        lenken / lehnen
//   RT                  treten
//   LT                  bremsen
//   Rechter Stick runter halten, dann loslassen/hoch  -> Bunnyhop
//   Rechter Stick hoch (am Boden)                     -> Counter-Pump (flacher abspringen)
//   Rechter Stick links/rechts (am Boden)             -> Hinterrad-Slide
//   LB + rechter Stick (in der Luft)                  -> Tricks
//   Y                   zurück auf die Strecke
//   A                   Start / weiter
//   B                   zurück zur Streckenwahl (Pause/Ziel)
//   Steuerkreuz ← →     lenken / Strecke wählen
//   Menü (≡)            Pause

const DEAD = 0.18;
const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export const input = {
  steer: 0, lean: 0,          // linker Stick x / y
  rx: 0, ry: 0,               // rechter Stick
  throttle: 0, brake: 0,
  trick: false,               // LB gehalten
  a: false, b: false, y: false, menu: false,
  aPressed: false, bPressed: false, yPressed: false, menuPressed: false,
  source: 'none',             // 'gamepad' | 'keyboard' | 'touch'
  padName: '',
};

const prev = { a: false, b: false, y: false, menu: false };
const keys = new Set();

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// ---------- Touch ----------
const touch = { stickId: null, sx: 0, sy: 0, x: 0, y: 0, gas: false, brake: false, hop: false, trick: false, a: false };
export function setupTouch() {
  const stick = document.getElementById('t-stick');
  const knob = document.getElementById('t-knob');
  if (!stick) return;
  const R = 55;
  stick.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touch.stickId = t.identifier;
    const r = stick.getBoundingClientRect();
    touch.sx = r.left + r.width / 2; touch.sy = r.top + r.height / 2;
    move(t); e.preventDefault();
  }, { passive: false });
  const move = (t) => {
    let dx = t.clientX - touch.sx, dy = t.clientY - touch.sy;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    touch.x = dx / R; touch.y = dy / R;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  window.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) if (t.identifier === touch.stickId) { move(t); e.preventDefault(); }
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) if (t.identifier === touch.stickId) {
      touch.stickId = null; touch.x = 0; touch.y = 0; knob.style.transform = '';
    }
  };
  window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);

  const bind = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { touch[key] = true; el.classList.add('on'); input.source = 'touch'; e.preventDefault(); }, { passive: false });
    const off = (e) => { touch[key] = false; el.classList.remove('on'); e.preventDefault(); };
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
  };
  bind('t-gas', 'gas'); bind('t-brake', 'brake'); bind('t-hop', 'hop'); bind('t-trick', 'trick');
}
export function touchTap() { touch.a = true; }

let rumbleOk = true;
export function rumble(strength = 0.6, ms = 150) {
  if (!rumbleOk) return;
  try {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (p && p.vibrationActuator && p.vibrationActuator.playEffect) {
        p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch(() => {});
      }
    }
  } catch { rumbleOk = false; }
}

export function pollInput() {
  let pad = null;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected) { pad = p; break; }

  let steer = 0, lean = 0, rx = 0, ry = 0, thr = 0, brk = 0, trick = false, a = false, b = false, y = false, menu = false;

  if (pad) {
    const ax = pad.axes, btn = pad.buttons;
    const bv = (i) => (btn[i] ? (typeof btn[i] === 'object' ? (btn[i].value || (btn[i].pressed ? 1 : 0)) : btn[i]) : 0);
    const bp = (i) => (btn[i] ? (typeof btn[i] === 'object' ? btn[i].pressed : btn[i] > 0.5) : false);
    steer = dz(ax[0] || 0); lean = dz(ax[1] || 0);
    if (bp(14)) steer = -1;            // Steuerkreuz links/rechts lenkt auch
    if (bp(15)) steer = 1;
    rx = dz(ax[2] || 0); ry = dz(ax[3] || 0);
    thr = bv(7); brk = bv(6);
    trick = bp(4);
    a = bp(0); b = bp(1); y = bp(3); menu = bp(9);
    if (Math.abs(steer) + Math.abs(lean) + Math.abs(rx) + Math.abs(ry) + thr + brk > 0.1 || a || b || y || menu || trick) {
      input.source = 'gamepad';
    }
    input.padName = pad.id;
  } else {
    input.padName = '';
  }

  // Tastatur
  const k = (c) => keys.has(c);
  if (keys.size) {
    if (input.source !== 'gamepad' || !pad) input.source = 'keyboard';
    const kL = k('ArrowLeft') || k('KeyA'), kR = k('ArrowRight') || k('KeyD');
    const kU = k('ArrowUp') || k('KeyW'), kD = k('ArrowDown') || k('KeyS');
    const shift = k('ShiftLeft') || k('ShiftRight');
    if (shift) {                         // Shift + Pfeile = Tricks
      trick = true;
      rx += (kR ? 1 : 0) - (kL ? 1 : 0);
      ry += (kD ? 1 : 0) - (kU ? 1 : 0);
    } else {
      steer += (kR ? 1 : 0) - (kL ? 1 : 0);
      if (kU) thr = 1;
      if (kD) brk = 1;
    }
    if (k('Space')) ry = 1;              // halten = aufladen, loslassen = Hop
    if (k('KeyQ')) rx -= 1;              // Slide
    if (k('KeyE')) rx += 1;
    if (k('Enter')) a = true;
    if (k('KeyR')) y = true;
    if (k('Backspace') || k('KeyB')) b = true;
    if (k('Escape') || k('KeyP')) menu = true;
  }

  // Touch
  if (touch.stickId !== null || touch.gas || touch.brake || touch.hop || touch.trick || touch.a) {
    input.source = 'touch';
    if (touch.trick) { trick = true; rx += touch.x; ry += touch.y; }
    else steer += touch.x;
    if (touch.gas) thr = 1;
    if (touch.brake) brk = 1;
    if (touch.hop) ry = 1;
    if (touch.a) { a = true; }
  }
  touch.a = false;

  const clamp = (v) => Math.max(-1, Math.min(1, v));
  input.steer = clamp(steer); input.lean = clamp(lean);
  input.rx = clamp(rx); input.ry = clamp(ry);
  input.throttle = Math.min(1, thr); input.brake = Math.min(1, brk);
  input.trick = trick;
  input.bPressed = b && !prev.b; input.b = b; prev.b = b;
  input.aPressed = a && !prev.a; input.yPressed = y && !prev.y; input.menuPressed = menu && !prev.menu;
  input.a = a; input.y = y; input.menu = menu;
  prev.a = a; prev.y = y; prev.menu = menu;
  return input;
}
