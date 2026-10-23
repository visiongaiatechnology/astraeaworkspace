# Belegzuordnung draw — ASR-Anforderungen auf Tests

Quelle der Anforderungen: `docs/plans/2700PLAN.md`, App-Block.
Testbestand: 45 Testdateien unter `ui/apps/draw/`.

| Anforderung | Aufgabentext | belegende Testdatei(en) |
|---|---|---|
| `ASR-1713` | aktuellen App-Root und sämtliche Dateien inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste und Umfang) |
| `ASR-1714` | aktuelle Importer und Imports vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (app-interne Importziele) |
| `ASR-1715` | Side Effects und Registrierungen vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste) |
| `ASR-1716` | vorhandene Unit-/Integration-/Roundtrip-Tests erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1717` | aktuelle Public API erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (exportierte Namen) |
| `ASR-1718` | Dateien >350 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1719` | Dateien >500 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1720` | Dead-/Duplicate-Code-Kandidaten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Duplicate-Kandidaten) |
| `ASR-1721` | Cross-App-Abhängigkeiten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (externe Abhängigkeiten) |
| `ASR-1722` | OLD → NEW → WHY Move-Plan dokumentieren. | **ARTEFAKT:** `docs/architecture/frontend/SOURCE_REORG_FILE_MAP.csv` - OLD/NEW/WHY fuer 1849 Zeilen, 1757 MOVED_AND_VERIFIED, 0 ohne why |
| `ASR-1723` | reale Zielstruktur aus `app/canvas/tools/paths/layers/objects/inspector/toolbar/state/model/import-export/testing` ablei | testing/interactions/drawCanvasPersistence.test.ts, testing/canvas/DrawCanvas.reachability.render.test.tsx, testing/interactions/drawCanvasSession.test.ts |
| `ASR-1724` | nur fachlich benötigte Unterordner anlegen; keine leeren Symmetrieordner. | **KEIN BELEG** |
| `ASR-1725` | App-Root auf Public Entry und wenige echte Root-Verträge reduzieren. | testing/import-export/drawSvgVectorImport.test.ts, testing/drop-zone/drawDropZoneWiring.contract.test.mjs |
| `ASR-1726` | UI-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1727` | State-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1728` | Model-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1729` | Domain-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1730` | Integrations-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1731` | Persistenz-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1732` | Import-/Export-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1733` | lokale Hooks lokal halten. | **KEIN BELEG** |
| `ASR-1734` | lokale Utilities lokal halten. | **KEIN BELEG** |
| `ASR-1735` | lokale Types lokal halten. | testing/interactions/drawDataGraphicsEngine.test.ts, testing/drop-zone/drawDropZone.test.ts |
| `ASR-1736` | App-zu-App-Deep-Imports eliminieren. | **KEIN BELEG** |
| `ASR-1737` | fremde Deep Imports in eigene Interna über Public API/Contract ersetzen. | testing/drop-zone/drawDropZoneWiring.contract.test.mjs, testing/canvas/drawInteractiveCanvasWiring.contract.test.mjs, testing/interactions/drawDataGraphicsEngine.test.ts |
| `ASR-1738` | `index.ts` ausschließlich mit echter Public API bestücken. | testing/interactions/drawSpatialIndex.test.ts, testing/interactions/drawDataGraphicsEngine.test.ts |
| `ASR-1739` | Side-effect-Barrels verhindern. | **KEIN BELEG** |
| `ASR-1740` | jede >350-LOC-Datei einem Responsibility Review unterziehen. | testing/drop-zone/drawDropZone.test.ts, testing/drop-zone/DrawDropZoneOverlay.render.test.tsx, testing/integrations/drawSendEngine.test.ts |
| `ASR-1741` | jede >500-LOC-Datei splitten oder als dokumentierte VGT-Ausnahme begründen. | **KEIN BELEG** |
| `ASR-1742` | keine künstliche Fragmentierung nur zur LOC-Reduktion erzeugen. | **KEIN BELEG** |
| `ASR-1743` | App-/Route-/Command-/Provider-IDs stabil halten. | testing/drop-zone/drawDropZone.test.ts, testing/interactions/drawConnectorEngine.test.ts |
| `ASR-1744` | DocumentKind und native File Extension stabil halten. | testing/interactions/drawCanvasPersistence.test.ts, testing/drop-zone/drawDropZoneWiring.contract.test.mjs, testing/drop-zone/drawDropZone.test.ts |
| `ASR-1745` | Storage-/Migration-Keys stabil halten. | **KEIN BELEG** |
| `ASR-1746` | Guide Anchors und data-testid stabil halten. | testing/canvas/drawInteractiveCanvasWiring.contract.test.mjs |
| `ASR-1747` | i18n-Keys stabil halten oder sauber migrieren. | **KEIN BELEG** |
| `ASR-1748` | Lazy-/Dynamic-Import-Grenzen nach Moves prüfen. | **KEIN BELEG** |
| `ASR-1749` | Theme-Tokens statt hardcodierter Theme-Styles verwenden. | **KEIN BELEG** |
| `ASR-1750` | Unit Tests unter app-eigenem `testing/unit/` ablegen. | testing/interactions/drawLargeDiagramBounds.test.ts, testing/interactions/drawHitTest.test.ts, testing/interactions/drawCommandEngine.test.ts |
| `ASR-1751` | Integrationstests unter app-eigenem `testing/integration/` ablegen. | testing/integration/drawWorkspaceIntegration.test.ts, testing/drop-zone/drawDropZone.test.ts, testing/drop-zone/DrawDropZoneOverlay.render.test.tsx |
| `ASR-1752` | Roundtrip `Create drawing → Edit vectors → Save → Reopen → Export` unter `testing/roundtrip/` ablegen. | testing/interactions/drawCanvasPersistence.test.ts, testing/interactions/drawLargeDiagramBounds.test.ts, testing/drop-zone/drawDropZone.test.ts |
| `ASR-1753` | Error-/Edge-Path-Test ablegen. | **KEIN BELEG** |
| `ASR-1754` | Persistenztest ablegen, sofern die App persistiert. | **KEIN BELEG** |
| `ASR-1755` | Import-/Export-Test ablegen, sofern die App Import/Export besitzt. | testing/import-export/drawSvgVectorImport.test.ts, testing/locale/drawCanvasErrorMapping.test.ts, testing/interactions/drawSceneProjection.test.ts |
| `ASR-1756` | Public-API-/Import-Boundary-Test ablegen. | **KEIN BELEG** |
| `ASR-1757` | Cosmic Obsidian visuell und funktional gegen das Theme-System testen. | testing/drop-zone/drawDropZone.test.ts, testing/drop-zone/DrawDropZoneOverlay.render.test.tsx |
| `ASR-1758` | Sovereign Gold visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1759` | Tactical Emerald visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1760` | Abyssal Sapphire visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1761` | Crimson Command visuell und funktional gegen das Theme-System testen. | testing/interactions/drawCommandEngine.test.ts, testing/drop-zone/drawDropZone.test.ts |
| `ASR-1762` | Arctic Daylight visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1763` | Locale DE auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/drawCanvasLocale.render.test.tsx, testing/locale/drawCanvasErrorMapping.test.ts, testing/canvas/drawInteractiveCanvasWiring.contract.test.mjs |
| `ASR-1764` | Locale EN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/drawCanvasLocale.render.test.tsx, testing/locale/drawCanvasErrorMapping.test.ts, testing/canvas/drawInteractiveCanvasWiring.contract.test.mjs |
| `ASR-1765` | Locale RU auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/drawCanvasLocale.render.test.tsx, testing/locale/drawCanvasErrorMapping.test.ts, testing/canvas/drawInteractiveCanvasWiring.contract.test.mjs |
| `ASR-1766` | Locale IT auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/drawCanvasLocale.render.test.tsx, testing/locale/drawCanvasErrorMapping.test.ts, testing/canvas/drawInteractiveCanvasWiring.contract.test.mjs |
| `ASR-1767` | Locale ES auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/drawCanvasLocale.render.test.tsx, testing/locale/drawCanvasErrorMapping.test.ts, testing/canvas/drawInteractiveCanvasWiring.contract.test.mjs |
| `ASR-1768` | Locale JA auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/drawCanvasLocale.render.test.tsx, testing/locale/drawCanvasErrorMapping.test.ts, testing/canvas/drawInteractiveCanvasWiring.contract.test.mjs |
| `ASR-1769` | Locale zh-CN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/drawCanvasLocale.render.test.tsx, testing/canvas/drawInteractiveCanvasWiring.contract.test.mjs, testing/locale/drawCanvasErrorMapping.test.ts |
| `ASR-1770` | Spezialpfad `Bezier/Paths` nach dem Move funktional testen. | testing/interactions/drawConnectorEngine.test.ts, testing/canvas/DrawInteractiveSurface.render.test.tsx |
| `ASR-1771` | Spezialpfad `Layers` nach dem Move funktional testen. | testing/interactions/drawLayerEngine.test.ts, testing/interactions/drawInteractionController.test.ts, testing/interactions/drawConnectorEngine.test.ts |
| `ASR-1772` | Spezialpfad `Objects` nach dem Move funktional testen. | testing/model/drawRoutingEngine.test.ts, testing/model/drawDocumentEngine.test.ts, testing/interactions/drawTransformEngine.test.ts |
| `ASR-1773` | Spezialpfad `Inspector` nach dem Move funktional testen. | testing/canvas/drawInteractiveCanvasWiring.contract.test.mjs, testing/canvas/DrawCanvas.reachability.render.test.tsx |
| `ASR-1774` | Spezialpfad `SVG` nach dem Move funktional testen. | **KEIN BELEG** |
| `ASR-1775` | Spezialpfad `Export` nach dem Move funktional testen. | testing/model/drawDocumentEngine.test.ts, testing/interactions/drawTransformEngine.test.ts, testing/interactions/drawLayerEngine.test.ts |
| `ASR-1776` | Keyboard-/Focus-/Accessible-Name-Smoke ausführen. | testing/canvas/drawCanvasKeyboardFocusAccessibleName.runtime.test.tsx |
| `ASR-1777` | Reduced-Motion-/High-Contrast-Smoke ausführen. | **KEIN BELEG** |
| `ASR-1778` | Bundle-/Lazy-Chunk-Verhalten vor/nach Refactor vergleichen. | **KEIN BELEG** |
| `ASR-1779` | Dead-/Duplicate-Code-Audit nach Moves wiederholen. | **KEIN BELEG** |
| `ASR-1780` | No-Functional-Change/Behavior-Parity-Test explizit dokumentieren. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1781` | Test- und Evidence-Pfade im zentralen Evidence-Index verlinken. | **KEIN BELEG** |
| `ASR-1782` | App-Gate nur bei vollständig grünem Testpaket PASS setzen. | **KEIN BELEG** |

## Was diese Zuordnung ist - und was nicht

Sie ist ein KANDIDATENVERGLEICH: sie prueft, ob Woerter des Aufgabentextes im Testnamen oder
Testinhalt vorkommen. **Sie behauptet NICHT, dass der genannte Test die Anforderung erfuellt.**

Zeilen mit `KEIN TEST` sind der ehrliche Teil: fuer sie gibt es keinen Kandidaten, und damit
keinen Beleg. Sie duerfen nicht abgehakt werden.

Der naechste Schritt ist, die Kandidaten EINZELN zu pruefen - und die bestaetigten dann als
Beleg zu fuehren.
