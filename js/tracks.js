// Streckendefinitionen. Jede Strecke ist eine Linie aus Punkten [x, z, höhe].
import { BOLOGNESE, WILDCAT } from './gpx-data.js';

function hash(i) {
  let h = (i * 374761393 + 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise1(s) {
  const i = Math.floor(s), f = s - i, t = f * f * (3 - 2 * f);
  return hash(i) + (hash(i + 1) - hash(i)) * t;
}

// Der bisherige, ausgedachte Trail
function testTrailPoints() {
  const pts = [];
  for (let s = 0; s <= 1400; s += 5) {
    const fade = Math.min(1, s / 60);
    const x = fade * (22 * Math.sin(s / 90) + 11 * Math.sin(s / 37 + 1.3) + 5 * Math.sin(s / 19));
    pts.push([x, -s, -s * 0.14 + (noise1(s / 70) - 0.5) * 6]);
  }
  return pts;
}

export const TRACKS = [
  {
    id: 'bolognese',
    name: 'Grunewald – Bolognese Trail',
    info: 'Berlin · ca. 300 m · kurz und knackig',
    points: BOLOGNESE,
    smooth: 5, heightSmooth: 24, minRadius: 12,
    bank: 3,
    // Kurz, darum dicht mit Sprüngen bepackt
    features: { start: 35, gap: [38, 50], pattern: ['table', 'drop', 'table', 'rollers', 'table'], size: 0.9 },
    minSlope: 0.07,
  },
  {
    id: 'wildcat',
    name: 'Berm Park – Wildcat',
    info: 'Flow-Trail · ca. 1,6 km · viele Anlieger',
    points: WILDCAT,
    smooth: 9, heightSmooth: 40, minRadius: 10,
    bank: 6,
    features: { start: 70, gap: [70, 110], pattern: ['table', 'table', 'drop', 'table', 'rollers', 'table'], size: 1 },
    minSlope: 0,
  },
  {
    id: 'test',
    name: 'Test-Trail',
    info: 'Ausgedacht · 1,4 km · Sprünge und Drops',
    points: testTrailPoints(),
    smooth: 3, heightSmooth: 20, minRadius: 14,
    bank: 3,
    features: { start: 90, gap: [60, 100], pattern: ['table', 'table', 'drop', 'table', 'rollers', 'table', 'drop'], size: 1 },
    minSlope: 0,
  },
];
