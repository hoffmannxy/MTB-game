# MTB Downhill

Ein kleines Mountainbike-Downhill-Spiel für den Browser, gemacht für das iPhone im Querformat mit Xbox-Controller.
Die Steuerung ist an Descenders angelehnt.

**Spielen:** https://hoffmannxy.github.io/MTB-game/

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
| B | Backspace | zurück zur Streckenwahl (in Pause/Ziel) |

Ohne Controller erscheint auf dem iPhone eine Touch-Steuerung. Dort macht TRICK allein in der Luft einen Backflip, TRICK + Stick-Richtung wählt den Trick (wie LB + rechter Stick). Auf der Tastatur entsprechend Shift allein bzw. Shift + Pfeile.

## Strecken

Auf dem Startbildschirm mit dem Stick (oder ◀ ▶) wählen:

| Strecke | Länge | Quelle |
|---|---|---|
| Grunewald – Bolognese Trail | ca. 300 m | GPX von Trailforks, mit zusätzlichen Sprüngen |
| Berm Park – Wildcat | ca. 1,5 km | GPX von MTB Project, mit Anliegern in den Kurven |
| Test-Trail | ca. 1,4 km | ausgedacht |

Kurven und Höhenprofil kommen aus den GPX-Dateien (geglättet). Sprünge, Drops und Wellen sind dazuerfunden.
Neue Strecken: GPX in Meter umrechnen, in `js/gpx-data.js` ablegen und in `js/tracks.js` eintragen.

## Regeln

- Abfahrt mit Tabletops, Drops und Wellen. Orange Fähnchen markieren die Absprünge.
- Flips und Spins müssen vor der Landung fertig sein, sonst gibt es einen Sturz.
- Punkte gibt es für Tricks und Airtime. Bestzeit und Highscore werden pro Strecke im Browser gespeichert.

## Technik

- Reines HTML/JavaScript ohne Build-Schritt; [three.js](https://threejs.org) liegt unter `lib/`.
- `js/tracks.js`, `js/gpx-data.js` – Streckendefinitionen
- `js/world.js` – Strecke, Gelände, Anlieger, Bäume, Hindernisse (Höhenfunktion)
- `js/bike.js` – Bike-Modell und Fahrphysik
- `js/input.js` – Controller, Tastatur, Touch
- `js/main.js` – Spielablauf, Kamera, HUD

Lokal testen: `python3 -m http.server` im Ordner starten und `http://localhost:8000` öffnen.
