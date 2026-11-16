// Bike: 3D-Modell und Fahrphysik (arcade, aber mit echter Schwerkraft und Sprüngen)
import * as THREE from 'three';
import { height, normalAt, onTrack, treeNear, pointAt } from './world.js';
import { rumble } from './input.js';

const G = 9.81;
const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

// ---------- Modell ----------
function buildModel() {
  const root = new THREE.Group();       // Position + Ausrichtung am Boden
  const trickG = new THREE.Group();     // Flips / Spins
  const leanG = new THREE.Group();      // Schräglage
  root.add(trickG); trickG.add(leanG);

  const frameM = new THREE.MeshLambertMaterial({ color: 0x1fa2ff });
  const darkM = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const tireM = new THREE.MeshLambertMaterial({ color: 0x151515 });
  const skinM = new THREE.MeshLambertMaterial({ color: 0xe0b48f });
  const shirtM = new THREE.MeshLambertMaterial({ color: 0xff4d2e });
  const pantsM = new THREE.MeshLambertMaterial({ color: 0x2b2f3a });
  const helmM = new THREE.MeshLambertMaterial({ color: 0xffd23f });

  const wheelG = new THREE.TorusGeometry(0.33, 0.06, 6, 16);
  const wheels = [];
  for (const zz of [-0.55, 0.55]) {
    const w = new THREE.Mesh(wheelG, tireM);
    w.rotation.y = Math.PI / 2;
    w.position.set(0, 0.36, zz);
    leanG.add(w); wheels.push(w);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 6), darkM);
    hub.rotation.z = Math.PI / 2; hub.position.copy(w.position); leanG.add(hub);
  }
  const tube = (a, b, r, m) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), m);
    c.position.copy(va).add(vb).multiplyScalar(0.5);
    c.quaternion.setFromUnitVectors(UP, vb.clone().sub(va).normalize());
    leanG.add(c);
    return c;
  };
  // Rahmen (vorne = -z)
  tube([0, 0.36, 0.55], [0, 0.42, 0.05], 0.035, frameM);     // Kettenstrebe
  tube([0, 0.42, 0.05], [0, 0.8, 0.15], 0.04, frameM);       // Sattelrohr
  tube([0, 0.8, 0.15], [0, 0.82, -0.38], 0.045, frameM);     // Oberrohr
  tube([0, 0.42, 0.05], [0, 0.78, -0.4], 0.05, frameM);      // Unterrohr
  tube([0, 0.36, -0.55], [0, 0.95, -0.42], 0.035, darkM);    // Gabel
  tube([-0.36, 0.98, -0.4], [0.36, 0.98, -0.4], 0.02, darkM); // Lenker
  tube([0, 0.8, 0.15], [0, 0.88, 0.2], 0.02, darkM);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.26), darkM);
  seat.position.set(0, 0.9, 0.22); leanG.add(seat);

  // Fahrer (eigene Gruppe zum Ducken)
  const rider = new THREE.Group(); leanG.add(rider);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.6, 0.14), pantsM); legL.position.set(-0.13, 0.75, 0.0); legL.rotation.x = 0.35;
  const legR = legL.clone(); legR.position.x = 0.13;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.55, 0.22), shirtM);
  torso.position.set(0, 1.25, -0.08); torso.rotation.x = -0.75;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.5, 0.09), shirtM); armL.position.set(-0.24, 1.18, -0.3); armL.rotation.x = -1.0;
  const armR = armL.clone(); armR.position.x = 0.24;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), skinM); head.position.set(0, 1.5, -0.33);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.155, 8, 6, 0, TAU, 0, Math.PI / 1.8), helmM); helmet.position.set(0, 1.53, -0.33);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.12), helmM); visor.position.set(0, 1.56, -0.48);
  rider.add(legL, legR, torso, armL, armR, head, helmet, visor);

  // Schatten
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;

  return { root, trickG, leanG, rider, wheels, shadow };
}

// ---------- Physik ----------
export class Bike {
  constructor(scene) {
    this.m = buildModel();
    scene.add(this.m.root);
    scene.add(this.m.shadow);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.n = new THREE.Vector3(0, 1, 0);
    this.reset(0);
  }

  // s = Meter ab Start auf der Strecke
  reset(s = 0) {
    const p = pointAt(s);
    this.pos.set(p.x, p.y, p.z);
    this.vel.set(0, 0, 0);
    this.yaw = p.yaw;
    this.grounded = true;
    this.airTime = 0;
    this.flip = 0; this.spin = 0;          // Trick-Rotationen (rad)
    this.flipVel = 0; this.spinVel = 0;
    this.leanVis = 0; this.crouch = 0;
    this.steerS = 0;                      // geglättete Lenkung
    this.charge = 0; this.wasCharging = false;
    this.absorb = false;
    this.crashed = false; this.crashT = 0;
    this.slide = 0;
    this.events = [];                       // für HUD: {type, text, points}
    this.wheelRot = 0;
    this.visPitch = 0;
  }

  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  speed() { return this.vel.length(); }

  crash(reason) {
    if (this.crashed) return;
    this.crashed = true; this.crashT = 0;
    this.crashSpin = (Math.random() - 0.5) * 6;
    this.events.push({ type: 'crash', text: reason });
    rumble(1, 400);
  }

  step(dt, inp) {
    const f = this.forward(new THREE.Vector3());
    if (this.crashed) {
      this.crashT += dt;
      // Ausrutschen und liegen bleiben
      const h = height(this.pos.x, this.pos.z);
      this.vel.y -= G * dt;
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.y < h) { this.pos.y = h; this.vel.y = 0; this.vel.multiplyScalar(Math.exp(-2.5 * dt)); }
      return;
    }

    // Lenkung weich machen: feine Kontrolle bei kleinen Ausschlägen, sanftes Ein- und Auslenken
    const target = Math.sign(inp.steer) * Math.pow(Math.abs(inp.steer), 1.5);
    this.steerS += (target - this.steerS) * (1 - Math.exp(-7 * dt));

    if (this.grounded) this.groundStep(dt, inp, f);
    else this.airStep(dt, inp, f);

    // Bäume
    const t = treeNear(this.pos.x, this.pos.z, 0.75 * 1);
    if (t && this.pos.y < t.y + 4) {
      if (this.speed() > 4.5) this.crash('Baum erwischt!');
      else {
        const dx = this.pos.x - t.x, dz = this.pos.z - t.z, l = Math.hypot(dx, dz) || 1;
        this.pos.x = t.x + (dx / l) * 0.76; this.pos.z = t.z + (dz / l) * 0.76;
        this.vel.multiplyScalar(0.3);
      }
    }
  }

  groundStep(dt, inp, f) {
    const n = normalAt(this.pos.x, this.pos.z, this.n);
    // Vorwärts/Seitwärts auf der Oberfläche
    const fw = f.clone().addScaledVector(n, -f.dot(n)).normalize();
    const right = new THREE.Vector3().crossVectors(fw, n).normalize();
    const v = this.vel;

    // Schwerkraft entlang des Hangs
    const g = new THREE.Vector3(0, -G, 0);
    g.addScaledVector(n, -g.dot(n));
    v.addScaledVector(g, dt);

    let vf = v.dot(fw);
    const speed = v.length();

    // Treten
    if (inp.throttle > 0 && vf < 13) v.addScaledVector(fw, inp.throttle * (vf < 4 ? 6 : 3.2) * dt);
    // Bremsen
    if (inp.brake > 0) {
      const dec = inp.brake * 11 * dt;
      if (Math.abs(vf) > dec) v.addScaledVector(fw, -Math.sign(vf) * dec); else v.addScaledVector(fw, -vf);
    }
    // Widerstand (neben der Strecke deutlich mehr)
    const track = onTrack(this.pos.x, this.pos.z);
    const roll = track ? 0.03 : 0.45;
    v.multiplyScalar(Math.max(0, 1 - (roll + 0.0022 * speed) * dt));

    // Slide (rechter Stick seitlich)
    const slideIn = Math.abs(inp.rx) > 0.5 && !inp.trick ? inp.rx : 0;
    this.slide += ((slideIn ? 1 : 0) - this.slide) * Math.min(1, 8 * dt);

    // Seitenhaftung
    const grip = 11 - this.slide * 8.5;
    const vr = v.dot(right);
    v.addScaledVector(right, -vr * (1 - Math.exp(-grip * dt)));
    if (this.slide > 0.3) v.multiplyScalar(1 - 0.6 * this.slide * dt);   // Slide bremst etwas

    // Lenken
    vf = v.dot(fw);
    const sp = Math.abs(vf);
    const rate = (2.4 / (1 + sp * 0.07)) * Math.min(1, 0.25 + sp / 3) + this.slide * 1.2;
    this.yaw += this.steerS * rate * dt * (vf < -0.3 ? -1 : 1) + slideIn * 0.9 * dt;

    // Bunnyhop: rechter Stick runter (aufladen), dann loslassen oder hoch
    const charging = inp.ry > 0.5 && !inp.trick;
    if (charging) this.charge = Math.min(0.7, this.charge + dt);
    if (this.wasCharging && !charging && this.charge > 0.08) {
      const imp = 2.4 + this.charge * 5.5;
      v.addScaledVector(n, imp);
      this.charge = 0;
      this.leaveGround(true);
    } else if (!charging) this.charge = 0;
    this.wasCharging = charging;
    // Counter-Pump: rechter Stick hoch
    this.absorb = inp.ry < -0.5 && !inp.trick;

    this.crouch += ((charging ? 1 : this.absorb ? 0.6 : 0) - this.crouch) * Math.min(1, 10 * dt);
    this.leanVis += (-this.steerS * Math.min(0.55, sp * 0.05) - this.leanVis) * Math.min(1, 5 * dt);

    if (!this.grounded) { this.pos.addScaledVector(v, dt); return; }

    // Bewegen und auf dem Boden halten
    this.pos.addScaledVector(v, dt);
    const h = height(this.pos.x, this.pos.z);
    const gap = this.pos.y - h;
    if (gap < 0) {
      this.pos.y = h;
      const n2 = normalAt(this.pos.x, this.pos.z);
      const vn = v.dot(n2);
      if (vn < 0) {
        if (vn < -18) { this.crash('Volle Wucht gegen die Kante!'); }
        else if (vn < -6) v.multiplyScalar(0.85);
        v.addScaledVector(n2, -vn);
      }
    } else if (gap - 0.5 * G * dt * dt < 0.004) {
      // Boden fällt langsamer weg als die Schwerkraft zieht -> bleibt am Boden
      this.pos.y = h;
      const n2 = normalAt(this.pos.x, this.pos.z);
      const vn = v.dot(n2);
      if (vn < 0) v.addScaledVector(n2, -vn);
    } else {
      this.leaveGround(false);
    }
  }

  leaveGround(hop) {
    this.grounded = false;
    this.airTime = 0;
    this.flip = 0; this.spin = 0; this.flipVel = 0; this.spinVel = 0;
    this.tricksDone = [];
    if (this.absorb && !hop && this.vel.y > 0) this.vel.y *= 0.5;   // Counter-Pump: flacher
    if (hop) this.events.push({ type: 'hop' });
  }

  airStep(dt, inp, f) {
    const v = this.vel;
    v.y -= G * dt;
    v.multiplyScalar(1 - 0.004 * v.length() * dt);
    this.airTime += dt;

    // Luftsteuerung (leicht)
    // kurze Hüpfer fühlen sich wie Boden an, lange Sprünge nur leicht steuerbar
    this.yaw += this.steerS * (this.airTime < 0.25 ? 1.8 : 0.9) * dt;

    // Tricks: LB + rechter Stick
    const tf = inp.trick ? inp.ry : 0;   // hoch (−) = Frontflip, runter (+) = Backflip
    const ts = inp.trick ? inp.rx : 0;
    const targetFlip = -tf * 7.5;        // rad/s
    const targetSpin = ts * 8.5;
    this.flipVel += (targetFlip - this.flipVel) * Math.min(1, (tf ? 5 : 3) * dt);
    this.spinVel += (targetSpin - this.spinVel) * Math.min(1, (ts ? 5 : 3) * dt);
    // ohne Eingabe zur nächsten sauberen Lage einpendeln
    if (!tf) this.flipVel += (Math.round(this.flip / TAU) * TAU - this.flip) * 4 * dt;
    if (!ts) this.spinVel += (Math.round(this.spin / TAU) * TAU - this.spin) * 4 * dt;
    this.flip += this.flipVel * dt;
    this.spin += this.spinVel * dt;

    // Vollständige Umdrehungen zählen
    const flips = Math.floor(Math.abs(this.flip) / TAU + 0.75);
    const spins = Math.floor(Math.abs(this.spin) / TAU + 0.75);
    this.pendingFlips = flips; this.pendingSpins = spins;

    this.crouch += ((inp.trick ? 0.7 : 0.2) - this.crouch) * Math.min(1, 6 * dt);
    this.leanVis *= 1 - Math.min(1, 3 * dt);

    this.pos.addScaledVector(v, dt);
    const h = height(this.pos.x, this.pos.z);
    if (this.pos.y <= h) this.land(h, f);
  }

  land(h, f) {
    this.pos.y = h;
    const n = normalAt(this.pos.x, this.pos.z, this.n);
    const v = this.vel;
    const impact = -v.dot(n);
    const fr = Math.abs(this.flip % TAU), sr = Math.abs(this.spin % TAU);
    const flipOff = Math.min(fr, TAU - fr), spinOff = Math.min(sr, TAU - sr);
    // Richtung Fahrtrichtung vs. Lenkerrichtung
    const vh = new THREE.Vector3(v.x, 0, v.z);
    let dirOff = 0;
    if (vh.length() > 2) dirOff = vh.normalize().angleTo(f);

    this.grounded = true;
    if (impact > 0) v.addScaledVector(n, -impact);

    if (flipOff > 0.75) return this.crash('Falsch gelandet – Flip nicht fertig!');
    if (spinOff > 0.9) return this.crash('Quer gelandet!');
    if (dirOff > 1.25 && dirOff < Math.PI - 0.6) return this.crash('Quer gelandet!');
    if (impact > 17) return this.crash('Zu harte Landung!');
    if (impact > 9) v.multiplyScalar(0.8);

    rumble(Math.min(1, impact / 12), 120);
    // Punkte
    const flips = this.pendingFlips || 0, spins = this.pendingSpins || 0;
    let pts = 0; const names = [];
    if (flips) {
      const front = this.flip > 0;
      names.push((flips > 1 ? flips + 'x ' : '') + (front ? 'Frontflip' : 'Backflip'));
      pts += flips * 500;
    }
    if (spins) { names.push(spins * 360 + '°'); pts += spins * 300; }
    if (this.airTime > 0.6) pts += Math.round(this.airTime * 60);
    if (flips && spins) pts = Math.round(pts * 1.5);
    const clean = flipOff < 0.25 && spinOff < 0.3;
    if (names.length && clean) { pts += 150; names.push('sauber!'); }
    if (pts > 0) this.events.push({ type: 'trick', text: names.length ? names.join(' + ') : `Airtime ${this.airTime.toFixed(1)}s`, points: pts });
    this.flip = 0; this.spin = 0; this.flipVel = 0; this.spinVel = 0;
    this.pendingFlips = 0; this.pendingSpins = 0;
  }

  // ---------- Darstellung ----------
  updateVisual(dt) {
    const m = this.m;
    m.root.position.copy(this.pos);
    const f = this.forward(new THREE.Vector3());

    let up;
    if (this.grounded || this.crashed) up = normalAt(this.pos.x, this.pos.z);
    else {
      // in der Luft: Nase folgt der Flugbahn etwas
      const vh = Math.hypot(this.vel.x, this.vel.z);
      const pitch = Math.atan2(this.vel.y, Math.max(1, vh)) * 0.6;
      this.visPitch += (pitch - this.visPitch) * Math.min(1, 5 * dt);
      const fwd = f.clone().multiplyScalar(Math.cos(this.visPitch)).add(new THREE.Vector3(0, Math.sin(this.visPitch), 0));
      const r = new THREE.Vector3().crossVectors(fwd, UP).normalize();
      up = new THREE.Vector3().crossVectors(r, fwd).normalize();
    }
    if (this.grounded) this.visPitch = 0;
    const fw = f.clone().addScaledVector(up, -f.dot(up)).normalize();
    const back = fw.clone().negate();
    const right = new THREE.Vector3().crossVectors(up, back).normalize();
    const mat = new THREE.Matrix4().makeBasis(right, up, back);
    m.root.quaternion.setFromRotationMatrix(mat);

    // Tricks: Flip um die Querachse (Drehpunkt Mitte Bike), Spin um die Hochachse
    m.trickG.position.set(0, 0.6, 0);
    m.leanG.position.set(0, -0.6, 0);
    m.trickG.rotation.set(-this.flip, this.spin, 0, 'YXZ');
    m.leanG.rotation.z = this.leanVis;

    if (this.crashed) {
      const t = Math.min(1, this.crashT * 2);
      m.leanG.rotation.z = this.leanVis + t * 1.4 * Math.sign(this.crashSpin || 1);
      m.rider.rotation.x = -t * 0.9;
      m.rider.position.set(t * 0.6, -t * 0.5, -t * 0.4);
    } else {
      m.rider.rotation.x = 0;
      m.rider.position.set(0, -this.crouch * 0.22, this.crouch * 0.05);
    }

    // Räder drehen
    const vf = this.vel.dot(f);
    this.wheelRot += (vf / 0.36) * dt;
    for (const w of m.wheels) w.rotation.x = this.wheelRot;

    // Schatten
    const h = height(this.pos.x, this.pos.z);
    const n = normalAt(this.pos.x, this.pos.z);
    m.shadow.position.set(this.pos.x, h + 0.06, this.pos.z);
    m.shadow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const hgt = this.pos.y - h;
    m.shadow.material.opacity = Math.max(0.08, 0.32 - hgt * 0.03);
    m.shadow.scale.setScalar(1 + hgt * 0.05);
  }
}
