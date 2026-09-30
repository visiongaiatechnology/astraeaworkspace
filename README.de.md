<p align="center">
  <img src="./astraeaworkspace1.png" alt="Astraea Workspace" width="680"/>
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <b>Deutsch</b> ·
  <a href="./README.it.md">Italiano</a> ·
  <a href="./README.es.md">Español</a> ·
  <a href="./README.fr.md">Français</a> ·
  <a href="./README.ru.md">Русский</a>
</p>

<p align="center">
  <strong>Ein souveräner, lokaler Produktivitäts-Workspace für echte Datenhoheit.</strong><br>
  <em>Local-First · Null Produkt-Telemetrie per Design · Authentifizierte verschlüsselte Container · Post-Quantum-fähige Sicherheit · Open Core</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Public%20Beta%20Pre--Release-FFB300?style=for-the-badge" alt="Public Beta Pre-Release"/>
  <img src="https://img.shields.io/badge/Core%20Milestone-3334%2F3334-00C853?style=for-the-badge&logo=checkmarx&logoColor=white" alt="Core Meilenstein 3334/3334"/>
  <img src="https://img.shields.io/badge/Core-Rust%202021-DEA584?style=for-the-badge&logo=rust&logoColor=white" alt="Rust Core"/>
  <img src="https://img.shields.io/badge/Shell-Tauri%20v2-24C8D8?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri v2"/>
  <img src="https://img.shields.io/badge/UI-React%2019%20%7C%20TypeScript-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React und TypeScript"/>
  <img src="https://img.shields.io/badge/Lizenz-AGPLv3-00B0FF?style=for-the-badge" alt="AGPLv3"/>
</p>

---

> [!IMPORTANT]
> ## Status der öffentlichen Veröffentlichung
>
> **Astraea Workspace befindet sich in der finalen Pre-Release-Härtung.**
>
> Der Meilenstein der Core-Implementierung ist abgeschlossen. Der aktuelle Release-Durchlauf konzentriert sich auf die Editionstrennung, End-to-End-Workflow-Verifikation, den Workspace Explorer, Design-Konsistenz, Barrierefreiheit (Accessibility), Lokalisierung, Sicherheitsnachweise (Evidence), Paketierung und abschließende Regressionstests.
>
> Offizielle Release-Builds werden erst nach Bestehen aller Release-Gates veröffentlicht. Bis dahin darf ein Meilenstein der internen Checkliste nicht mit einem fertig ausgelieferten, verifizierten öffentlichen Release verwechselt werden.

---

## Was ist Astraea Workspace?

Astraea Workspace ist eine Desktop-Produktivitätssuite, die auf einem einfachen Prinzip beruht:

**Ihre Arbeit muss nutzbar, verständlich und unter Ihrer Kontrolle bleiben – selbst wenn kein Cloud-Dienst verfügbar ist.**

Sie vereint Office-Bearbeitung, Wissensmanagement, Kreativwerkzeuge, Automatisierung, lokale Suche, verschlüsselte Speicherung und anwendungsübergreifende Workspace-Objekte in einer einzigen Desktop-Umgebung.

Kern-Workflows sind **Local-First**. Netzwerkfunktionen sind explizite Fähigkeiten und keine Voraussetzung für das Öffnen oder Bearbeiten Ihrer Dokumente.

Astraea ist keine bloße Ansammlung voneinander isolierter Editoren mit neuem Anstrich. Alle Anwendungen teilen ein gemeinsames **Workspace Object Model (WOM)**, sodass kompatible Objekte anwendungsübergreifend referenziert, eingebettet, durchsucht, automatisiert und wiederverwendet werden können.

### Produktprinzipien

- **Standardmäßig Local-First** — Dokumente und Workspace-Zustände verbleiben lokal, sofern der Benutzer nicht bewusst eine Netzwerkfunktion aktiviert.
- **Null Produkt-Telemetrie per Design** — für den normalen Workspace-Betrieb ist keinerlei Verhaltensanalyse- oder Telemetrie-Pipeline erforderlich.
- **Offline- und Air-Gap-fähig** — Kern-Workflows sind so konzipiert, dass sie ohne Cloud-Konto oder dauerhafte Internetverbindung funktionieren.
- **Open Core, dauerhaft kostenlos** — Astraea Open Core steht unter der GNU AGPLv3 und bleibt das dauerhaft freie Fundament des Produkts.
- **Explizite Premium-Grenze** — Premium erweitert das System um Organisation, strukturierte Geschäftsdaten, Projektplanung, Team-Spaces und verschlüsselte Zusammenarbeit. Es dient nicht dazu, die freie Edition künstlich unbrauchbar zu machen.
- **Anwendungsübergreifende Objekte** — Writer, Grid, Whiteboard, Publish, Insight, Automate und weitere Anwendungen teilen kompatible Workspace-Objekte, anstatt alles über Copy-and-Paste zu erzwingen.
- **Sicherheit durch konkrete Kontrollen** — kryptografische Primitive, Schlüsselverwaltung, Netzwerkrichtlinien und Release-Nachweise werden direkt dokumentiert, anstatt sich auf vage Marketingbegriffe zu stützen.

---

# Editionen

## Astraea Open Core — Dauerhaft kostenlos

Astraea Open Core bildet das Fundament für persönliche Produktivität.

Es ist **vollständig frei und quelloffen unter der GNU AGPLv3**.

Die in Open Core enthaltenen Anwendungen bleiben fester Bestandteil der freien Edition. Zukünftige Premium-Entwicklungen können neue organisatorische Fähigkeiten ergänzen; Open Core ist jedoch als vollwertiges Produkt konzipiert und nicht als zeitlich begrenztes Demo-System.

## Astraea Premium — Organisation, Daten und Zusammenarbeit

Astraea Premium ist das kommerzielle Superset.

Es umfasst den gesamten Umfang von Open Core und ergänzt diesen um sechs Anwendungen für Projektdurchführung, strukturierte Unternehmensdaten, Team-Spaces und verschlüsselte Zusammenarbeit über mehrere Geräte hinweg.

> **Open Core ist das souveräne persönliche Office. Premium verbindet die Organisation darum herum.**

### Editions-Matrix

| Anwendung | Open Core | Premium | Format | Hauptaufgabe |
|---|:---:|:---:|:---:|---|
| **Astraea Writer** | ✅ | ✅ | `.vdoc` | Textverarbeitung, strukturierte Dokumente, Tabellen, Referenzen und Export |
| **Astraea Grid** | ✅ | ✅ | `.vgrid` | Tabellenkalkulation mit mehreren Blättern, Formeln, Analysen und Diagrammen |
| **Astraea Present** | ✅ | ✅ | `.vpresent` | Folienpräsentationen, Szenen, Medien und Vortrags-Workflows |
| **Astraea Notes** | ✅ | ✅ | `.vnote` | Notizen, persönliches Wissensmanagement und verknüpftes Wissen |
| **Astraea PDF Studio** | ✅ | ✅ | `.vpdf` | PDF-Anzeige, Annotationen, Signaturen und Schwärzungs-Workflows |
| **Astraea Tasks** | ✅ | ✅ | `.vtask` | Persönliche Aufgaben, Wiederholungen, Prioritäten und Workspace-Verknüpfungen |
| **Astraea Whiteboard** | ✅ | ✅ | `.vboard` | Unendliche Leinwand, Diagramme, Mindmaps und Live-Workspace-Objekte |
| **Astraea Vault** | ✅ | ✅ | `.vvault` | Verschlüsselte Zugangsdaten, geschützte Dateien und sensible Daten |
| **Astraea Draw** | ✅ | ✅ | `.vdraw` | Vektorzeichnung, ebenenbasierte Grafiken und SVG-Workflows |
| **Astraea Publish** | ✅ | ✅ | `.vpub` | Desktop-Publishing für strukturierte Seitenlayouts und druckorientierte Ausgabe |
| **Astraea Insight** | ✅ | ✅ | `.vinsight` | Lokale Dashboards, Kennzahlen und analytische Ansichten |
| **Astraea Connect** | ✅ | ✅ | `.vconnect` | Abgesicherte externe Integrationen und Schnittstellengrenzen |
| **Astraea Automate** | ✅ | ✅ | `.vauto` | Deterministische lokale Workflow-Automatisierung |
| **Astraea Admin & Policy** | ✅* | ✅ | `.vpolicy` | Lokale Richtlinien, Administration und sicherheitsrelevante Konfiguration |
| **Astraea Projects** | 🔒 | ✅ | `.vproj` | Projekte, Phasen, Abhängigkeiten, Gantt-Diagramme und Risikoplanung |
| **Astraea Planner** | 🔒 | ✅ | `.vplan` | Kanban, Arbeitslastverteilung, Kalender und kollaborative Planung |
| **Astraea Database** | 🔒 | ✅ | `.vdb` | Typisierte relationale No-Code-Datenmodelle und Workspace-Datenansichten |
| **Astraea Forms** | 🔒 | ✅ | `.vform` | Entwurf von Formularen und Umfragen, bedingte Logik und strukturierte Rückmeldungen |
| **Astraea Spaces** | 🔒 | ✅ | `.vspace` | Team-Räume, Rollen, Richtlinienkontexte und Organisationsgrenzen |
| **Astraea GaiaCom** | 🔒 | ✅ | `.vgcom` | Verschlüsselte Kommunikation, Mesh-Synchronisation und Kollaborations-Transport |

\* Open Core enthält die Administrations- und Richtlinienoberflächen, die sich auf Open Core selbst beziehen. Betriebliche Richtlinienfunktionen ausschließlich für Premium verbleiben in Premium.

### Gemeinsame Plattform-Oberflächen

Die folgenden Komponenten sind Workspace-Plattformfunktionen und keine separat monetarisierten Dokumentenanwendungen:

- **Workspace Explorer / Library** — vorhandene Workspace-Dokumente entdecken, organisieren, in der Vorschau anzeigen und wiederverwenden.
- **Suche** — lokale, anwendungsübergreifende Suche.
- **Einstellungen** — persistierte Workspace- und Anwendungskonfigurationen.
- **Leitfäden (Guides)** — interaktive Einführungen und anwendungsspezifische Anleitungen.
- **Wiederherstellung / Diagnose** — lokale Rettungs- und Fehlerdiagnose-Oberflächen.
- **Befehlspalette und Shell-Navigation** — einheitliche Workspace-Steuerungsebene.

---

# Workspace Explorer

Astraea Workspace beinhaltet einen zentralen **Workspace Explorer**, sodass Benutzer nicht wissen müssen, welche Anwendung ein Dokument aktuell geöffnet hat, um es wiederzuverwenden.

Der Explorer macht gespeicherte Arbeiten anwendungsübergreifend auffindbar:

```text
Alle Dateien
Zuletzt verwendet
Geöffnet
Favoriten
Sammlungen
Suche
Vorschau
Quelle öffnen
Aus Workspace einfügen
Drag & Drop
```

Der entscheidende Unterschied ist die semantische Auflösung.

Wird eine `.vgrid`-Datei per Drag & Drop in Writer gezogen, wird sie nicht als beliebige Rohdatei behandelt. Astraea bietet gezielt die passenden Aktionen für Quelle und Ziel an:

```text
Live-Bereich (Live Range)
Eingefrorener Schnappschuss (Frozen Snapshot)
Als Writer-Tabelle kopieren
Quelle öffnen
```

Dasselbe Modell unterstützt kompatible Objekte anwendungsübergreifend zwischen Writer, Grid, Present, Whiteboard, Publish, Insight, Automate und weiteren Workspace-Programmen.

---

# Local-First bedeutet nicht isoliert

Astraea ist primär für die lokale Nutzung konzipiert, doch Local-First bedeutet nicht „niemals kommunizieren“.

Open Core bleibt ohne Cloud-Konto vollständig produktiv nutzbar.

Premium kann verschlüsselte Synchronisation, Spaces und GaiaCom-Kollaboration ergänzen, sobald der Benutzer oder die Organisation diese explizit aktiviert.

Netzwerkfähige Funktionen bleiben stets durch Richtlinien begrenzt und ändern nichts am Eigentumsmodell lokaler Dokumente.

---

# Sicherheitsarchitektur

Astraea Workspace folgt einem **Zero-Trust-Design für lokales Rechnen**.

Das Projekt dokumentiert konkrete Sicherheitsmechanismen, anstatt sich hinter undefinierten Phrasen wie „militärische Sicherheit“ zu verstecken.

## VWC-verschlüsselte Container

Native Workspace-Dokumente werden in der Astraea-Containerarchitektur gespeichert.

Relevante Schutzmaßnahmen umfassen:

- Authentifizierte Verschlüsselung mit modernen AEAD-Konstruktionen wie **AES-256-GCM** und **ChaCha20-Poly1305**, wo anwendbar;
- **Argon2id** zur passwortbasierten Schlüsselableitung, sofern eine Passphrase Teil des Schlüsselpfads ist;
- Integritäts- und Authentifizierungsprüfungen rund um Containerdaten;
- Begrenzte Parsing- und Validierungsprozesse an Dateivertrauensgrenzen;
- Explizite Versionierungs- und Migrationspfade.

Genaue Algorithmen und Profile sind Implementierungsdetails und werden in Architektur- und Release-Nachweisen dokumentiert, anstatt auf Werbe-Schlagworte reduziert zu werden.

## VGT Infinity Cryptographic Core

Astraea Workspace integriert den **VGT Infinity Cryptographic Core** als natives First-Party-Sicherheitssubsystem.

In der aktuellen Repository-Architektur befindet sich Infinity unter:

```text
vendor/infinity
```

und stellt fortgeschrittene kryptografische Bausteine für Astraea-Sicherheitsprofile bereit, darunter:

- Hybride klassische / post-quantenfähige Schlüsselvereinbarungsprofile;
- Standardisierte **ML-KEM**-Unterstützung in entsprechenden Profilen;
- **ML-DSA** und weitere Signaturprimitive für unterstützte Signaturprofile;
- Authentifizierte symmetrische Verschlüsselungskonstruktionen;
- Hochsichere Composite-Profile, die mehrere unabhängige Primitive kombinieren können;
- Explizite Schlüsseltrennung, Integritätsverifikation und sichere Speicherverwaltung durch das Infinity-Subsystem;
- Kryptografische Provider-Isolation, falls Primitive über definierte Sidecar-/Provider-Grenzen bereitgestellt werden.

Die aktuelle Infinity-Integration im Repository enthält über die ML-KEM / ML-DSA-Baseline hinaus spezialisierte Post-Quantum- und Composite-Profile. Exakt aktivierte Algorithmen, Provider-Versionen und Profilzusammensetzungen sind **Gegenstand der Release-Evidence** und keine Marketing-Konstanten: Maßgeblich für einen spezifischen Build sind das finale SBOM, Lockfiles, das Architekturdokument und das Release-Manifest.

Diese Unterscheidung ist wesentlich: Astraea behauptet nicht, dass das Aneinanderreihen von Algorithmen magische oder mathematisch unknackbare Sicherheit erzeugt. Infinity dient als zusätzliche native Kryptografieschicht, deren Profile gezielt ausgewählt und verifiziert werden.

## Post-Quantum-Unterstützung

Über die Infinity-Integration und Astraeas nativen Sicherheits-Stack unterstützt der Workspace post-quantenfähige kryptografische Komponenten, einschließlich der standardisierten **ML-KEM**- und **ML-DSA**-Familien in entsprechenden Profilen.

Post-Quanten-Kryptografie reduziert spezifische langfristige Bedrohungen; sie ist **keine** pauschale Garantie gegen jeden denkbaren zukünftigen Angriff.

## NetGate

Netzwerkzugriffe basieren auf expliziten Richtlinien anstelle einer unbeschränkten Standardausleitung.

Gilt eine NetGate-Richtlinie, werden ausgehende Verbindungen über eine Positivliste (Allowlist) geführt und können vor der eigentlichen Netzwerknutzung auf Anwendungsebene blockiert werden. Konnektoren und Kollaborations-Transporte müssen definierte Richtliniengrenzen passieren.

## Betriebssystemgestützter Schlüsselschutz

Astraea integriert sich nach Möglichkeit in die Schlüsselverwaltungsdienste des Betriebssystems:

- **Windows:** DPAPI / Windows-Anmeldeinformationsverwaltung
- **macOS:** Keychain-Dienste mit hardwaregestütztem Schutz, wo von Gerät und Konfiguration unterstützt
- **Linux:** Secret Service / libsecret-kompatible Schlüsselspeicher, sofern vorhanden

Hardwaregestützter Schutz ist fähigkeitsabhängig und wird nicht auf jedem System vorausgesetzt.

## Sicherheitsnachweise (Evidence)

Offizielle Releases werden mit überprüfbaren Release-Artefakten ausgeliefert:

- Abhängigkeits- und Lizenzinventar;
- SPDX SBOM;
- Release-Hashes (SHA-256);
- Signiertes Release-Manifest;
- Provenance- und Build-Nachweise, sofern durch die Pipeline erzeugt.

Das mit einem Release veröffentlichte Artefakt-Set ist die verbindliche Quelle für das jeweilige Release.

---

# Architektur

Astraea kombiniert einen performanten Rust-Core mit einer Tauri-Desktop-Shell und einer Benutzeroberfläche auf Basis von React und TypeScript.

```text
┌─────────────────────────────────────────────────────────────┐
│                    Astraea Desktop Shell                    │
│                         Tauri v2                            │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              React / TypeScript UI                   │  │
│  │                                                       │  │
│  │  Workspace Shell · Explorer · Editoren · Einstellungen │  │
│  │  Leitfäden · Suche · Cross-App-Objektoberflächen      │  │
│  └─────────────────────────┬─────────────────────────────┘  │
│                            │ typisierte IPC                 │
│  ┌─────────────────────────▼─────────────────────────────┐  │
│  │                    Rust Core                          │  │
│  │                                                       │  │
│  │  WOM · VWC · Suche · Policy · Interop · Recovery      │  │
│  │  Krypto · Automatisierung · NetGate · Native Integr.  │  │
│  └─────────────────────────┬─────────────────────────────┘  │
└────────────────────────────┼────────────────────────────────┘
                             │
                Natives OS / lokaler Speicher /
                OS-Schlüsselspeicher / explizite Konnektoren
```

### Warum Tauri?

Tauri nutzt die WebView des Betriebssystems, anstatt für jede Anwendung eine eigene Browser-Laufzeitumgebung mitzuliefern. Dies reduziert den Distributionsaufwand erheblich und erhält gleichzeitig einen nativen Rust-Anwendungskern.

Siehe die offizielle Tauri-Architekturdokumentation:  
https://tauri.app/concept/architecture/

### First-Party-Kernstrategie

Astraea behält kritische Workspace-Funktionen bewusst unter nativer First-Party-Kontrolle:

- Workspace Object Model
- Workspace-Editoren
- Dokument- und Referenzsemantik
- Lokale Suchintegration
- Richtlinien-Engine (Policy Engine)
- Automatisierungs-Laufzeitumgebung
- Interoperabilitäts-Orchestrierung
- Verschlüsselte Workspace-Container
- **VGT Infinity Cryptographic Core** für hochentwickelte Sicherheitsprofile

Drittanbieter-Bibliotheken kommen dort zum Einsatz, wo sie ingenieurtechnisch sinnvoll sind – insbesondere für auditierte kryptografische Primitive, Plattformintegration und begrenzte Rendering-Komponenten.

Der exakte Abhängigkeitsbaum gehört in das generierte SBOM, nicht in werbliche Texte.

---

# Leistung und Ressourcenbedarf

Astraea vermeidet gezielt unnötige Laufzeit-Duplikationen.

Durch Tauris Nutzung der System-WebView bündelt Astraea keine eigenständige Chromium-Instanz, wie es bei herkömmlichen Electron-Anwendungen der Fall ist. Diese Architekturentscheidung kann den Paket- und Prozess-Overhead spürbar senken, wenngleich der reale Arbeitsspeicherbedarf vom Betriebssystem, geöffneten Dokumenten, der WebView-Implementierung, Vorschauen, Suchindizes und aktiven Anwendungen abhängt.

## Aktuelle Pre-Release-Beobachtung

Auf dem aktuellen Windows-Pre-Release-Referenzsystem ergaben interne Messungen näherungsweise:

**~100–150 MB RAM im Leerlauf (Idle) ohne geöffnetes Arbeitsdokument**

Dies ist eine **interne Pre-Release-Messung** und keine universelle Garantie. Finale Release-Werte werden zusammen mit Betriebssystem, Build, WebView-Version, Dokumentzustand und Messmethode veröffentlicht.

## Warum wir keine irreführenden RAM-Zahlen von Mitbewerbern veröffentlichen

RAM-Vergleiche zwischen Office-Suiten führen leicht in die Irre.

Microsoft Word mit einem leeren Dokument, ein Browser mit Google Docs, LibreOffice mit Java-gestütztem Base und ein Multiprozess-Desktop-Editor stellen völlig unterschiedliche Arbeitslasten dar.

Aus diesem Grund führt die nachfolgende Tabelle die **offiziellen Systemanforderungen der Hersteller** auf und keine konstruierten Leerlauf-Benchmarks:

| Produkt | Offizielle Speicheranforderung / Referenz | Offline-Desktop-Betrieb | Quelle |
|---|---:|:---:|---|
| **Astraea Workspace** | Interne Pre-Release-Messung: ~100–150 MB idle; 4 GB System-RAM für flüssiges Arbeiten empfohlen | ✅ | VGT Pre-Release-Messung |
| **Microsoft 365 Apps** | 4 GB RAM laut aktuellen Windows- / macOS-Anforderungen | ✅ Desktop-Apps | [Microsoft](https://support.microsoft.com/de-de/office/systemanforderungen-f%C3%BCr-microsoft-365-und-office-71423642-bbbb-4811-93e3-add3ff2d3192) |
| **LibreOffice** | Mindestens 256 MB RAM, 512 MB empfohlen für Windows/Linux | ✅ | [LibreOffice](https://de.libreoffice.org/download/systemvoraussetzungen/) |
| **ONLYOFFICE Desktop Editors** | 2 GB RAM oder mehr | ✅ | [ONLYOFFICE](https://helpcenter.onlyoffice.com/de/desktop/installation/desktop-sys-reqs-windows.aspx) |
| **Google Docs / Sheets / Slides** | Browserabhängig; keine direkt vergleichbare Standalone-Desktop-Zahl | ⚠️ Offline-Modus nach Einrichtung verfügbar | [Google](https://support.google.com/docs/answer/6388102?hl=de) |

> **Wichtig:** Minimaler Systemarbeitsspeicher und gemessener Working-Set einer Anwendung sind zwei verschiedene Metriken. Die Tabelle dient dem Kontext und stellt keine Gleichsetzung dar.

Ein reproduzierbarer Astraea-Benchmark sollte mindestens folgende Werte ausweisen:

```text
Kaltstart
Leerlauf nach Stabilisierung
Writer-Dokument
Grid-Arbeitslast
PDF-Arbeitslast
Suchindexierungszustand
Peak Working Set
Private Working Set
CPU im Leerlauf
Test-Betriebssystem / WebView / Build-Hash
```

---

# Ein fairer Vergleich mit anderen Produktivitätssuiten

Astraea benötigt keine unzutreffenden Behauptungen über andere Produkte, um die eigene Position zu verdeutlichen.

Microsoft 365 Desktop-Programme können Dateien lokal oder in OneDrive / SharePoint speichern. Google Docs, Tabellen und Präsentationen bieten nach Aktivierung einen Offline-Modus. LibreOffice und ONLYOFFICE Desktop Editors arbeiten standardmäßig offline mit lokalen Dateien.

Der Unterschied, den Astraea verfolgt, ist daher nicht einfach „andere Suiten erzwingen die Cloud“.

Es ist die **Kombination** aus Local-First-Datenhoheit, einem gemeinsamen Workspace-Objektmodell, expliziten Netzwerkrichtlinien, integrierten verschlüsselten Containern, einer freien Open-Core-Edition und einer gemeinsamen Shell über Office-, Wissens-, Sicherheits- und Automatisierungswerkzeuge hinweg.

| Eigenschaft | Astraea Workspace | Microsoft 365 | Google Workspace | LibreOffice | ONLYOFFICE Desktop |
|---|---|---|---|---|---|
| **Primäres Modell** | Local-First Desktop-Workspace | Desktop + Cloud-Dienste | Cloud-first Web-Suite | Lokale Desktop-Suite | Lokale Desktop-Suite + optionale Cloud |
| **Lokale Datei-Workflows** | ✅ Vollwertig | ✅ Unterstützt | ⚠️ Offline-Modus für unterstützte Editoren | ✅ | ✅ |
| **Cloud-Konto für lokale Kernbearbeitung nötig** | Nein | Abhängig von Produkt/Lizenz | Kontobasierter Dienst | Nein | Nein |
| **Open-Source Desktop-Fundament** | ✅ Open Core, AGPLv3 | Nein | Nein | ✅ MPLv2 | ✅ AGPLv3 |
| **Gemeinsames Astraea-Objektmodell** | ✅ WOM | Andere Architektur | Andere Architektur | Andere Architektur | Andere Architektur |
| **Verschlüsselte Astraea-Container** | ✅ | Andere Architektur | Andere Architektur | Andere Architektur | Andere Architektur |
| **Null Produkt-Telemetrie per Astraea-Design** | ✅ | Herstellerspezifisch | Herstellerspezifisch | Projektspezifisch | Herstellerspezifisch |
| **Kommerzielle Team-/Datenerweiterung** | ✅ Premium | ✅ | ✅ | Ökosystem / Drittanbieter | ✅ |

Offizielle Referenzen für diesen Vergleich:

- Microsoft Verhalten beim lokalen/Cloud-Speichern: https://support.microsoft.com/de-de/office/dateien-speichern-freigeben-und-synchronisieren-70da744d-0f4d-472e-9f6d-b6480b556942
- Google Offline-Bearbeitung: https://support.google.com/docs/answer/6388102?hl=de
- LibreOffice Systemanforderungen: https://de.libreoffice.org/download/systemvoraussetzungen/
- ONLYOFFICE Offline-Desktop-Betrieb: https://helpcenter.onlyoffice.com/de/desktop/getting-started.aspx

---

# Die 20 integrierten Anwendungen

## Office & Publishing

### Astraea Writer — `.vdoc`
Professionelle Dokumentbearbeitung, Typografie, Formatvorlagen, Tabellen, Referenzen, strukturierte Inhalte und Dokumentenaustausch.

### Astraea Grid — `.vgrid`
Tabellenkalkulation mit mehreren Tabellenblättern, Formeln, Analysen, Diagrammen und tabellarischen Datenabläufen.

### Astraea Present — `.vpresent`
Vektorbasierte Präsentationen, Folienaufbau, Medienintegration und Referentenansichten.

### Astraea Publish — `.vpub`
Desktop-Publishing für Broschüren, Publikationen, seitenbasierte Layoutdokumente und druckorientierte Gestaltung.

## Wissen, Konzeption & Kreativarbeit

### Astraea Notes — `.vnote`
Persönliches Wissensmanagement, verknüpfte Notizen, Markdown-Workflows und Wissensbeziehungen.

### Astraea Whiteboard — `.vboard`
Unendliche Leinwand, Diagramme, Mindmaps, visuelle Planung und Live-Workspace-Objekte.

### Astraea Draw — `.vdraw`
Vektorzeichnen, Ebenen, Bézier-Kurven und SVG-orientierte Grafiken.

### Astraea PDF Studio — `.vpdf`
PDF-Anzeige- und Bearbeitungs-Workflows einschließlich Annotationen, Signaturen und kontrollierter Schwärzung.

## Aufgaben, Planung & Ausführung

### Astraea Tasks — `.vtask`
Persönliche Aufgabenverwaltung, Wiederholungen, Prioritäten, Unteraufgaben und Direktverknüpfungen zu Workspace-Objekten.

### Astraea Planner — `.vplan` — Premium
Kanban-Boards, Arbeitslaststeuerung, Terminplanung und kollaborative Team-Abläufe.

### Astraea Projects — `.vproj` — Premium
Projektphasen, Meilensteine, Abhängigkeiten, Gantt-Ansichten und Projektrisikoplanung.

## Daten, Formulare & Auswertung

### Astraea Forms — `.vform` — Premium
Formulare, Umfragen, bedingte Logik und strukturierte Erfassung von Rückmeldungen.

### Astraea Database — `.vdb` — Premium
Typisierte relationale Datenmodelle, strukturierte Datensätze und verknüpfte Workspace-Ansichten.

### Astraea Insight — `.vinsight`
Lokale analytische Ansichten, Kennzahlen, Dashboards und abgeleitete Workspace-Erkenntnisse.

## Sicherheit, Automatisierung & Konnektivität

### Astraea Vault — `.vvault`
Verschlüsselte Zugangsdaten, geschützte Dateien und sensible Arbeitsinhalte.

### Astraea Spaces — `.vspace` — Premium
Team- und Organisationsräume mit Rollen- und Richtlinienkontexten.

### Astraea Connect — `.vconnect`
Abgesicherte externe Konnektoren und explizite Schnittstellengrenzen.

### Astraea Automate — `.vauto`
Deterministische lokale Workflow-Automatisierung.

### Astraea Admin & Policy — `.vpolicy`
Sicherheitsrelevante Administration, Richtlinienzustände und editionsgerechte Konfiguration.

### Astraea GaiaCom — `.vgcom` — Premium
Verschlüsselte Kommunikation und Synchronisationsfunktionen für kollaborative Astraea-Umgebungen.

---

# Preise und Lizenzierung

## Open Core

| Edition | Preis | Lizenz | Verfügbarkeit |
|---|---:|---|---|
| **Astraea Open Core** | **0 €** | **GNU AGPLv3** | Dauerhaft kostenlos |

Open Core läuft nicht ab und erfordert kein Abonnement.

## Geplante Premium-Lizenzierung

Astraea Premium ist als **dauerhafte kommerzielle Lizenz (Perpetual License)** geplant – ohne verpflichtendes wiederkehrendes Abonnement.

| Edition | Geplante Verfügbarkeit | Geplanter Einmalpreis | Geplantes Major-Version-Upgrade |
|---|---:|---:|---:|
| **Premium Beta Early-Bird** | Nov 2026 – Feb 2027 | **39,99 €** | **~45,99 €** |
| **Premium Regulär** | Ab März 2027 | **69,00 €** | **~45,99 €** |
| **Non-Profit & Bildung** | Berechtigte Organisationen | **36,99 €** | **9,99 €** |

> [!NOTE]
> Premium ist derzeit noch nicht offiziell gestartet. Vor dem Start dargestellte Konditionen spiegeln den aktuellen Planungsstand wider und stellen Vorab-Informationen dar, bis Bestellprozess und Lizenzierung öffentlich freigeschaltet sind.

---

# Installation

## Öffentliche Binärdateien

Offizielle Installationsprogramme und Release-Pakete werden nach Bestehen aller Release-Gates unter **GitHub Releases** bereitgestellt.

Zielplattformen:

```text
Windows
macOS
Linux
```

Die Verfügbarkeit kann sich je nach Plattform unterscheiden, falls ein plattformspezifisches Gate noch in Bearbeitung ist.

## Aus dem Quellcode erstellen

### Voraussetzungen

- Node.js 20 LTS oder 22 LTS
- Rust / Cargo
- Tauri CLI v2
- Plattformspezifische Tauri-Build-Abhängigkeiten

### UI

```bash
cd ui
npm ci
npm run typecheck
npm run build
```

### Desktop Shell

```bash
cd crates/vgt-desktop
cargo tauri dev
```

Produktions-Paketierung:

```bash
cargo tauri build
```

> Build-Befehle und Toolchain-Versionen richten sich nach den Lockfiles des Repositories und der aktuellen Release-Dokumentation, falls sie von den obigen Beispielen abweichen.

---

# Systemanforderungen

Aktuelles Pre-Release-Ziel:

- **RAM:** Mindestens 4 GB Arbeitsspeicher; 8 GB empfohlen für umfangreiche Multi-Dokument-Workflows
- **Festplatte:** Finale Speicherplatzanforderungen werden anhand des Release-Bundles bekanntgegeben
- **Bildschirm:** Moderner Desktop-Monitor; Skalierung für Barrierefreiheit wird nativ unterstützt
- **Internet:** Für die lokale Kernbearbeitung nicht erforderlich; nur für explizit vom Benutzer aktivierte Netzwerkfunktionen, Updates oder externe Konnektoren nötig

Endgültige Versionsvorgaben für die jeweiligen Betriebssysteme werden mit den Release-Artefakten veröffentlicht.

---

# Release-Readiness

Der ursprüngliche Meilensteinplan der Kernimplementierung erreichte:

```text
3334 / 3334
```

Diese Kennzahl steht für den vollständigen Abschluss der internen Implementierungs-Checkliste.

Sie besagt für sich genommen **nicht**, dass ein öffentliches Release bereits fertiggestellt ist.

Die öffentliche Beta durchläuft einen separaten Release-Readiness-Durchlauf:

```text
Physische Trennung beider Editionen
Funktionsgrenzen zwischen Open Core und Premium
Workspace Explorer / Library
Anwendungsübergreifende Einfüge- und Drag-and-Drop-Abläufe
Überarbeitung des Design-Systems
Theme-Verifikation über alle Ansichten
Interaktive Leitfäden (Guides)
Verdrahtung aller Einstellungen
Lokalisierung
Barrierefreiheit (Accessibility)
Sicherheitsnachweise (Evidence)
End-to-End-Roundtrips
Import-/Export-Regressionstests
Wiederherstellungsverhalten
Leistung und Optimierung
Paketierung
SBOM / Hashes / Provenance
Prüfung sichtbarer Release-Mängel
```

Der Repository-Status wechselt erst dann von **Pre-Release** auf **Beta**, wenn diese Qualitäts-Gates durch den realen Release-Zustand nachgewiesen sind.

---

# Dokumentation

Verfügbare Produkt- und Technikdokumentationen:

| Dokument | Sprache | Art |
|---|:---:|---|
| [What is Astraea Workspace?](./01_Astraea_Workspace_What_It_Is_EN.pdf) | Englisch | Produkt / Konzept |
| [Premium Security & Sovereignty](./02_Astraea_Workspace_Premium_Security_Sovereignty_EN.pdf) | Englisch | Technisches Whitepaper |
| [Was ist Astraea Workspace?](./01_Astraea_Workspace_Was_es_ist_DE.pdf) | Deutsch | Produkt / Konzept |
| [Premium Sicherheit & Souveränität](./02_Astraea_Workspace_Premium_Sicherheit_Souveraenitaet_DE.pdf) | Deutsch | Technisches Whitepaper |
| [Produktivität & Datenfluss](./03_Astraea_Workspace_Premium_Produktivitaet_Datenfluss_DE.pdf) | Deutsch | Produktarchitektur |
| [Che cos'è Astraea Workspace?](./01_Astraea_Workspace_Che_Cose_IT.pdf) | Italienisch | Produkt / Konzept |
| [Sicurezza Premium & Sovranità](./02_Astraea_Workspace_Premium_Sicurezza_Sovranita_IT.pdf) | Italienisch | Technisches Whitepaper |
| [¿Qué es Astraea Workspace?](./01_Astraea_Workspace_Que_Es_ES.pdf) | Spanisch | Produkt / Konzept |
| [Seguridad Premium & Soberanía](./02_Astraea_Workspace_Premium_Seguridad_Soberania_ES.pdf) | Spanisch | Technisches Whitepaper |
| [Qu'est-ce qu'Astraea Workspace ?](./01_Astraea_Workspace_Ce_Que_Cest_FR.pdf) | Französisch | Produkt / Konzept |
| [Sécurité Premium & Souveraineté](./02_Astraea_Workspace_Premium_Securite_Souverainete_FR.pdf) | Französisch | Technisches Whitepaper |
| [Что такое Astraea Workspace?](./01_Astraea_Workspace_What_It_Is_RU.pdf) | Russisch | Produkt / Konzept |
| [Премиальная безопасность и суверенитет](./02_Astraea_Workspace_Premium_Security_Sovereignty_RU.pdf) | Russisch | Technisches Whitepaper |

---

# Transparenz der Lieferkette (Supply Chain)

Astraeas Veröffentlichungsprozess stellt die Überprüfbarkeit der fertigen Software sicher:

Offizielle Release-Nachweise umfassen, sofern durch die finale Pipeline erzeugt:

```text
Abhängigkeits- und Lizenzinventar
SPDX SBOM
SHA-256 Release-Hashes
Signiertes Release-Manifest
Build-Provenance
```

Die generierten Release-Artefakte bilden die verbindliche Referenz für Abhängigkeiten und Versionen.

Diese README verzichtet bewusst darauf, eine fehleranfällige manuelle Abhängigkeitstabelle zu führen, die von `Cargo.lock`, `package-lock.json`, `go.sum` und dem generierten SBOM abweichen könnte.

---

# Lizenz

**Astraea Workspace Open Core ist unter der GNU Affero General Public License v3.0 (AGPL-3.0) lizenziert.**

Siehe:

- [`LICENSE`](./LICENSE)
- [`NOTICE`](./NOTICE), sofern vorhanden
- Spezifische Hinweise der Abhängigkeiten und das Release-SBOM

Astraea Premium wird separat unter einer kommerziellen Lizenz vertrieben.

---

# Vision

Software sollte Menschen dabei unterstützen, Ideen zu entwickeln, Pläne zu schmieden, Daten zu analysieren und zusammenzuarbeiten – ohne dass sie dafür die Kontrolle über ihre vertraute Arbeitsumgebung aufgeben müssen.

Astraea Workspace wurde genau nach diesem Leitgedanken erbaut:

**lokal, wo lokales Arbeiten ausreicht; explizit, wo Vernetzung gefordert ist; offen, wo das Open-Core-Versprechen gilt; und nahtlos interoperabel über den gesamten Workspace hinweg.**

<p align="center">
  <strong>Astraea Workspace</strong><br>
  <em>Your Mind. Your Work. Your Sovereignty.</em><br><br>
  <sub>© 2026 VisionGaiaTechnology · Open Core lizenziert unter AGPL-3.0</sub>
</p>
