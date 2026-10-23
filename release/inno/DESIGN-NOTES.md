# Installer-Design — Astraea Workspace Alpha 0.1 (Inno Setup)

Dieses Dokument begründet die visuelle Gestaltung des Inno-Setup-Wizards und
dokumentiert, welche GLASS-Grundsätze Inno Setup zulässt — und welche nicht.
Es ist bewusst ehrlich: Ein Inno-Wizard ist kein Web-Frontend.

## 1) Product DNA (Designprofil)

| Dimension | Ausprägung |
| --- | --- |
| Produktart | lokal-first Sovereign-Workspace (Open-Core-Beta), Windows-Desktop |
| Hauptnutzer | Wissensarbeiter, Power-User, Alpha-Tester |
| Hauptaufgabe des Installers | Vertrauen schaffen, Beta-/AGB-Bedingungen klar machen, saubere Installation/Deinstallation |
| Informationsdichte | niedrig (Wizard: 1 Fokus pro Seite) |
| Vertrauensanforderung | hoch (Daten, Rechte, Zuordnungen) |
| Emotionale Grundhaltung | ruhig, souverän, zurückhaltend-premium |
| Visuelle Energie | niedrig bis mittel (kein Neon, keine „Hacker"-Optik) |
| Signature Element | achtzackiger Astraea-Kompassstern + feine Gold-Horizontlinie |
| Motion | Inno-eigene Wizard-Übergänge; keine dekorativen Dauer-Animationen |

Die Farbfamilie ist aus dem echten App-Designsystem abgeleitet
(`ui/src/design-system/styles/foundation.css`: `--as-bg-environment:#07080d`,
`--as-bg-workbench:#0b0d14`, `--as-bg-control:#131724`,
`--as-text-primary:#f5f7ff`, `--as-text-secondary:#bdc5d8`,
`--as-text-muted:#929bad`). Der Installer verwendet damit dieselbe
Graphit-Grundfläche wie die Anwendung; zusätzlich wird die vom Auftrag geforderte
ruhige Indigo-/Gold-Akzentuierung eingesetzt (kein Neon-Violett der App-Ikone).

## 2) Farbtokens des Installers

| Token | Wert | Verwendung |
| --- | --- | --- |
| Environment (Z0) | `#07080D` | Wizard-Hintergrund (`WizardBackColor`), Icons |
| Workbench (Z1) | `#0B0D14` | Bildflächen, Materialscheibe |
| Control (Z2) | `#131724` | Icon-Platten, kleine Flächen |
| Ink | `#F5F7FF` | Wortmarke / Primärtext in Bildern |
| Ink Soft | `#BDC5D8` | Sekundärtext in Bildern |
| Ink Muted | `#929BAD` | Meta-Zeilen, Captions |
| Indigo | `#7A86C8` | Kompassstern außen, Orbit-Linien |
| Indigo Deep | `#4E5A96` | Stern-Verlauf |
| Gold | `#C8A96A` | feine Akzente, Stern-Kern, Hairlines |
| Gold Light | `#E3C88F` | Uninstall-Minus, Highlight |

**Kontrast (WCAG 2.x, berechnet):**

| Paar | Verhältnis | Bewertung |
| --- | --- | --- |
| Ink `#F5F7FF` auf `#0B0D14` | **18,1 : 1** | AAA |
| Ink auf `#07080D` | **18,7 : 1** | AAA |
| Gold `#C8A96A` auf `#0B0D14` | **8,6 : 1** | AAA |
| Gold auf `#07080D` | **8,9 : 1** | AAA |
| Muted `#929BAD` auf `#0B0D14` | **6,95 : 1** | AA (groß AAA) |
| Indigo `#7A86C8` auf `#07080D` | **5,78 : 1** | AA |
| Sekundärtext auf `#07080D` | **11,6 : 1** | AAA |

Farbe trägt nie allein: Status auf der Systemprüfungsseite nutzt Textmarker
`[ OK ]` / `[ FEHLT ]` (nicht nur Farbe), passend zur Anforderung
„Information nicht ausschließlich über Farbe".

## 3) Komposition der Wizard-Bilder

### WizardImageFile (links, 164:314-Format, multiple DPI-Größen)

Fläche, Hierarchie, Leerraum:

1. **Z0** ruhiger Graphit-Verlauf, sehr weiche Indigo-Lichtzone oben rechts,
   ein kaum sichtbarer goldwarmer Schimmer unten (Materialtiefe, kein Glow-Orb).
2. **Materialscheibe** (Glas-Anmutung) mit dem achtzackigen
   Astraea-Kompassstern (Indigo-Verlauf, Gold-Kern) — Markenanker.
3. **Wortmarke** `ASTRAEA` / `WORKSPACE` in Segoe UI Light, gesperrt; darunter
   eine feine Gold-Hairline mit auslaufendem Gradient.
4. **Beta-Kennung** `OPEN CORE · ALPHA 0.1` (Semibold, gesperrt, Gold/Muted).
5. Bewusste negative Mitte (Ruhe, Premium).
6. **Meta-Block** unten: `WINDOWS 10/11 · x64` und
   `VISIONGAIATECHNOLOGY` — Information statt Dekoration.
7. **Markengeometrie**: eine sehr feine Orbitlinie (Indigo) und ein kurzer
   Gold-Bogen als „Horizont" — keine Raster, keine Punktraster, keine Neonlinien.

### WizardSmallImageFile (oben rechts, quadratisch)

Dunkle, abgerundete Platte mit Indigo-Hairline und dem Kompassstern; bei 16–58 px
lesbar. Multi-DPI-Varianten: 58/77/97/124/159 px.

### WizardBackImageFile (Inhaltsfläche, 497:360)

Sehr dunkler Graphit-Verlauf mit großflächiger, weicher Indigo-Lichtzone rechts
und goldwarmem Schimmer unten links; eine feine Gold-Bogenlinie als Signatur.
Der Kontrast bleibt bewusst niedrig, damit Inno-Dark-Text (hell) auf allen Seiten
lesbar bleibt — der Hintergrund ist Umgebung, nicht Tapete.

### Icons

- `astraea-setup.ico`: Kompassstern auf dunkler Platte, feiner Gold-Orbitbogen.
- `astraea-uninstall.ico`: Indigo-Ring mit goldenem Minus (eindeutige
  Deinstallations-Semantik, gleiche Materialidentität).
- Enthaltene Größen: 16, 24, 32, 48, 64, 128, 256 px (DIB-Einträge ohne
  Zusatz-Dependencies).

## 4) Inno-Setup-Umsetzung (GLASS so weit wie möglich)

| GLASS-/Design-Idee | Inno-Umsetzung | Grenze |
| --- | --- | --- |
| Dunkle Materialflächen | `WizardStyle=modern dark hidebevels includetitlebar` (6.7+/7) + `WizardBackColor=#07080D` | Inno-Farbschema ist VCL-Style-basiert; einzelne Controls nicht frei brandbar |
| Eigene Bildwelt | `WizardImageFile`, `WizardSmallImageFile`, `WizardBackImageFile` (multi-DPI, PNG/BMP) | kein Blur/Backdrop-Filter |
| Feine Hairlines / Gold-Akzent | in den Bild-Assets gezeichnet | nicht als CSS-Layer möglich |
| Materialtiefe | Verläufe + weiche Lichtzonen + Materialscheibe | keine echten Transparenz-Ebenen über Controls |
| Ruhige Typografie | Segoe UI (Inno-6.7+-Default) in den Bildern; System-Dialogfont | freie Fonts nur eingeschränkt/nicht ohne Installer-Abhängigkeiten |
| Klare Hierarchie | Welcome/License/Info/Systemprüfung/Dir/Tasks/Ready/Finish | Standard-Inno-Seitenfolge |
| Glass nur begrenzt | eine Materialscheibe je Bild; keine „alles ist Glas"-Flächen | Inno kann keine Live-Blur-Flächen rendern |
| Kein AI-Slop | keine Raster, keine Orbs, keine Neon-Pills, keine Badge-Flut, keine Gradient-Headline | — |

**Bewusste Entscheidung „forced dark":** Der Wizard erzwingt den dunklen Stil, um
die Astraea-Identität konsistent zu zeigen. Inno fällt bei aktivem
Windows-Kontrastmodus und bei `/NOSTYLE` automatisch auf die Systemdarstellung
zurück; das ist dokumentiert und akzeptiert.

**Eigene Seite „Systemprüfung":** Sie zeigt Windows-Version, WebView2- und
VC++-Erkennung sowie fehlende Komponenten mit offiziellen Download-Schaltflächen.
Bei fehlenden Laufzeiten bleibt die Installation möglich; die App startet erst
nach deren Installation (ehrliche Kommunikation statt Blockade).

## 5) Anti-Slop-Audit (Kurzcheck)

- [x] Eigene Identität statt generischem Installer-Look (dunkle Markenbilder + Icons)
- [x] Keine dekorativen Raster/Dot-Grids (auch nicht im Hintergrundbild)
- [x] Keine Neon-/Cyberpunk-Optik; Gold nur als feiner Akzent
- [x] Keine Card-Wand; Wizard-Seiten bleiben task-first
- [x] Typografie trägt Hierarchie (Wortmarke, Beta-Kennung, Meta-Zeilen)
- [x] Farbe semantisch und kontrastgeprüft; Status nicht nur farbcodiert
- [x] Leerraum bewusst erhalten (Wizard-Bildmitte)
- [x] Bilder funktionieren auch ohne Effekte (Silhouette/Grayscale-Test: Wortmarke,
  Stern, Hairlines bleiben als Struktur erkennbar)
- [x] Keine externen CDN-/Font-Abhängigkeiten (Segoe-UI-Systemfont, lokale Assets)
- [x] Wizard-Bilder deterministisch aus Skript erzeugbar

## 6) Visuelle QA

- `assets/preview/contact-sheet.png` — Kontaktbogen aller Assets inkl. 2×-Wizard-Bild.
- `assets/preview/wizard-simulation.png` — **Simulation** des Wizard-Layouts
  (ausdrücklich keine echte Inno-Renderaufnahme).
- `evidence/inno-wizard-start.png` — **echte Renderaufnahme** des kompilierten
  `Setup.exe` (Inno Setup 7.1.0, `/CURRENTUSER`): Welcome-Seite mit großem
  WizardImageFile, dunklem Stil, Inno-Dark-Buttons und Hintergrundbild.
- `evidence/inno-wizard-license.png` — **echte Renderaufnahme** der Lizenzseite:
  WizardSmallImageFile oben rechts, DE-AGB-Text, `BeveledLabel` unten links,
  Scroll-Leiste, dunkle Flächen.

Die Screenshots stammen aus einem QA-Compile mit `ShowLanguageDialog=no` (alle
übrigen Design-Direktiven identisch zum finalen Build); der QA-Build wurde danach
verworfen. Damit ist die reale Inno-Optik mindestens für Welcome- und Lizenzseite
verifiziert — inklusive der Erkenntnis, dass das große Markenbild nur auf
Welcome/Finish erscheint und das SmallImage auf den inneren Seiten.

**Ehrliche Grenze:** Es gibt auf dieser Maschine keine automatisierte
Screenshot-Suite für alle Wizard-Seiten. Die eigene Systemprüfungsseite und der
Deinstallationsdialog wurden nur per Silent-Test/Statik geprüft, nicht visuell
abgenommen. Die Wizard-Assets selbst wurden per Vorschaubildern und Header-Checks
visuell/kontrastseitig geprüft.

## 7) Asset-Spezifikation (generiert von `generate-assets.ps1`)

| Datei | Format | Größe (px) | Zweck |
| --- | --- | --- | --- |
| `wizard-image-100.bmp` | BMP 24bpp | 202 × 386 | WizardImageFile 100 % |
| `wizard-image-125.bmp` | BMP 24bpp | 269 × 515 | 125 % |
| `wizard-image-150.bmp` | BMP 24bpp | 336 × 643 | 150 % |
| `wizard-image-200.bmp` | BMP 24bpp | 430 × 824 | 200 % |
| `wizard-image-250.bmp` | BMP 24bpp | 534 × 1022 | 250 % |
| `wizard-small-100…250.bmp` | BMP 24bpp | 58, 77, 97, 124, 159 | WizardSmallImageFile |
| `wizard-back-100/150/200/250.png` | PNG | 596×432 … 1630×1148 | WizardBackImageFile |
| `astraea-setup.ico` | ICO (7 Größen) | 16…256 | SetupIconFile |
| `astraea-uninstall.ico` | ICO (7 Größen) | 16…256 | UninstallDisplayIcon |

Alle Maße folgen der Inno-Setup-Dokumentation (6.6+-Flächengrößen für
`WizardImageFile`/`WizardSmallImageFile` bzw. 497:360 für `WizardBackImageFile`).
Die Assets enthalten **keine** Zusatz-Dependencies; der Generator nutzt nur
PowerShell 5.1 und `System.Drawing`.
