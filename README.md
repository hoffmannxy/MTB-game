# MTB Downhill

Ein kleines Mountainbike-Downhill-Spiel für den Browser, gemacht für das iPhone im Querformat mit Xbox-Controller.
Die Steuerung ist an Descenders angelehnt.

**Spielen:** https://hoffmannxy.github.io/mtb-game/

Tipp fürs iPhone: In Safari öffnen → Teilen → „Zum Home-Bildschirm“. Dann startet das Spiel wie eine App, ohne Adressleiste.

## Controller verbinden

iPhone: Einstellungen → Bluetooth. Am Xbox-Controller die Koppeltaste oben gedrückt halten, bis das X schnell blinkt, und dann den Controller in der Liste antippen. Danach im Spiel eine beliebige Taste drücken, damit der Controller erkannt wird.

## Steuerung

| Controller | Tastatur | Aktion |
|---|---|---|
| Linker Stick | ← → / A D | lenken |
| RT | ↑ / W | treten |
| LT | ↓ / S | bremsen |
| Rechter Stick ↓ halten, dann loslassen | Leertaste halten, loslassen | Bunnyhop (länger halten = höher) |
| Rechter Stick ↑ vor der Kante | – | Counter-Pump (flacher abspringen) |
| Rechter Stick ← → | Q / E | Slide |
| LB + rechter Stick (in der Luft) | Shift + Pfeile | ↑ Frontflip, ↓ Backflip, ← → Spin |
| Y | R | zurück auf die Strecke |
| A | Enter | Start / weiter |
| ≡ Menü | Esc / P | Pause |

Ohne Controller erscheint auf dem iPhone eine Touch-Steuerung.

## Regeln

- 1,4 km Abfahrt mit Tabletops, Drops und Wellen. Orange Fähnchen markieren die Absprünge.
- Flips und Spins müssen vor der Landung fertig sein, sonst gibt es einen Sturz.
- Punkte gibt es für Tricks und Airtime. Bestzeit und Highscore werden im Browser gespeichert.

## Technik

- Reines HTML/JavaScript ohne Build-Schritt; [three.js](https://threejs.org) liegt unter `lib/`.
- `js/world.js` – Strecke, Gelände, Bäume, Hindernisse (Höhenfunktion)
- `js/bike.js` – Bike-Modell und Fahrphysik
- `js/input.js` – Controller, Tastatur, Touch
- `js/main.js` – Spielablauf, Kamera, HUD

Lokal testen: `python3 -m http.server` im Ordner starten und `http://localhost:8000` öffnen.
