# Belegzuordnung vault — ASR-Anforderungen auf Tests

Quelle der Anforderungen: `docs/plans/2700PLAN.md`, App-Block.
Testbestand: 41 Testdateien unter `ui/apps/vault/`.

| Anforderung | Aufgabentext | belegende Testdatei(en) |
|---|---|---|
| `ASR-1643` | aktuellen App-Root und sämtliche Dateien inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste und Umfang) |
| `ASR-1644` | aktuelle Importer und Imports vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (app-interne Importziele) |
| `ASR-1645` | Side Effects und Registrierungen vor Moves erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (Dateiliste) |
| `ASR-1646` | vorhandene Unit-/Integration-/Roundtrip-Tests erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1647` | aktuelle Public API erfassen. | **ARTEFAKT:** `testing/INVENTAR.md` (exportierte Namen) |
| `ASR-1648` | Dateien >350 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1649` | Dateien >500 LOC inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (LOC-Schwellen) |
| `ASR-1650` | Dead-/Duplicate-Code-Kandidaten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (Duplicate-Kandidaten) |
| `ASR-1651` | Cross-App-Abhängigkeiten inventarisieren. | **ARTEFAKT:** `testing/INVENTAR.md` (externe Abhängigkeiten) |
| `ASR-1652` | OLD → NEW → WHY Move-Plan dokumentieren. | **ARTEFAKT:** `docs/architecture/frontend/SOURCE_REORG_FILE_MAP.csv` - OLD/NEW/WHY fuer 1849 Zeilen, 1757 MOVED_AND_VERIFIED, 0 ohne why |
| `ASR-1653` | reale Zielstruktur aus `app/unlock/entries/secrets/files/crypto-ui/toolbar/panels/state/model/integrations/persistence/t | testing/panels/vaultPanels.render.test.tsx, testing/security/vaultLockPersistence.test.ts, testing/files/vaultFileSystemEngine.test.ts |
| `ASR-1654` | nur fachlich benötigte Unterordner anlegen; keine leeren Symmetrieordner. | testing/panels/vaultPanels.render.test.tsx, testing/files/vaultFileSystemEngine.test.ts |
| `ASR-1655` | App-Root auf Public Entry und wenige echte Root-Verträge reduzieren. | testing/actions/vaultActionsLayers.test.ts, testing/sync/vaultPeerSyncEngine.test.ts, testing/setup/vaultFirstRun.test.tsx |
| `ASR-1656` | UI-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1657` | State-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1658` | Model-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1659` | Domain-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1660` | Integrations-Verantwortung sauber kapseln. | **KEIN BELEG** |
| `ASR-1661` | Persistenz-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1662` | Import-/Export-Verantwortung sauber kapseln, sofern vorhanden. | **KEIN BELEG** |
| `ASR-1663` | lokale Hooks lokal halten. | testing/files/vaultFileSystemEngine.test.ts, testing/sync/vaultPeerSyncEngine.test.ts, testing/actions/vaultIntegrityRecoveryActions.test.ts |
| `ASR-1664` | lokale Utilities lokal halten. | testing/files/vaultFileSystemEngine.test.ts, testing/sync/vaultPeerSyncEngine.test.ts, testing/actions/vaultIntegrityRecoveryActions.test.ts |
| `ASR-1665` | lokale Types lokal halten. | testing/files/vaultFileSystemEngine.test.ts, testing/sync/vaultPeerSyncEngine.test.ts, testing/integrity/vaultRepairIntegrity.test.ts |
| `ASR-1666` | App-zu-App-Deep-Imports eliminieren. | **KEIN BELEG** |
| `ASR-1667` | fremde Deep Imports in eigene Interna über Public API/Contract ersetzen. | testing/integrity/vaultBoundedMemory.contract.test.mjs, testing/contract/vaultRuntimeLockWiring.contract.test.mjs, testing/contract/vaultImportDepth.contract.test.mjs |
| `ASR-1668` | `index.ts` ausschließlich mit echter Public API bestücken. | testing/contract/vaultRuntimeLockWiring.contract.test.mjs, testing/sync/vaultPeerSyncEngine.test.ts, testing/security/vaultShareEngine.test.ts |
| `ASR-1669` | Side-effect-Barrels verhindern. | **KEIN BELEG** |
| `ASR-1670` | jede >350-LOC-Datei einem Responsibility Review unterziehen. | testing/security/vaultSelfTestSuite.test.ts, testing/security/vaultAccessPolicyEngine.test.ts, testing/files/vaultFileSystemEngine.test.ts |
| `ASR-1671` | jede >500-LOC-Datei splitten oder als dokumentierte VGT-Ausnahme begründen. | **KEIN BELEG** |
| `ASR-1672` | keine künstliche Fragmentierung nur zur LOC-Reduktion erzeugen. | **KEIN BELEG** |
| `ASR-1673` | App-/Route-/Command-/Provider-IDs stabil halten. | testing/picker/vaultPickerEngine.test.ts, testing/security/vaultSessionLock.test.ts, testing/integrity/vaultRepairIntegrity.test.ts |
| `ASR-1674` | DocumentKind und native File Extension stabil halten. | testing/files/vaultFileSystemEngine.test.ts, testing/files/vaultFileErrorPlacement.test.tsx, testing/picker/vaultPickerEngine.test.ts |
| `ASR-1675` | Storage-/Migration-Keys stabil halten. | testing/security/vaultSessionLock.test.ts, testing/picker/vaultPickerEngine.test.ts, testing/integrity/vaultRepairIntegrity.test.ts |
| `ASR-1676` | Guide Anchors und data-testid stabil halten. | testing/security/vaultSessionLock.test.ts, testing/picker/vaultPickerEngine.test.ts, testing/integrity/vaultRepairIntegrity.test.ts |
| `ASR-1677` | i18n-Keys stabil halten oder sauber migrieren. | testing/security/vaultSessionLock.test.ts, testing/picker/vaultPickerEngine.test.ts, testing/integrity/vaultRepairIntegrity.test.ts |
| `ASR-1678` | Lazy-/Dynamic-Import-Grenzen nach Moves prüfen. | testing/contract/vaultEvidenceCoverage.contract.test.mjs |
| `ASR-1679` | Theme-Tokens statt hardcodierter Theme-Styles verwenden. | **KEIN BELEG** |
| `ASR-1680` | Unit Tests unter app-eigenem `testing/unit/` ablegen. | testing/security/vaultSelfTestSuite.test.ts, testing/contract/vaultRuntimeLockWiring.contract.test.mjs, testing/contract/vaultImportDepth.contract.test.mjs |
| `ASR-1681` | Integrationstests unter app-eigenem `testing/integration/` ablegen. | testing/sync/vaultPeerSyncEngine.test.ts, testing/recovery/vaultTrashRecovery.test.ts, testing/contract/vaultRuntimeLockWiring.contract.test.mjs |
| `ASR-1682` | Roundtrip `Unlock → Create/View protected item → Lock → Unlock → Verify` unter `testing/roundtrip/` ablegen. | testing/contract/vaultRuntimeLockWiring.contract.test.mjs, testing/security/vaultLockRevocation.render.test.tsx, testing/security/vaultLockPersistence.test.ts |
| `ASR-1683` | Error-/Edge-Path-Test ablegen. | **KEIN BELEG** |
| `ASR-1684` | Persistenztest ablegen, sofern die App persistiert. | **KEIN BELEG** |
| `ASR-1685` | Import-/Export-Test ablegen, sofern die App Import/Export besitzt. | testing/contract/vaultExportConsolidation.contract.test.mjs, testing/contract/vaultImportDepth.contract.test.mjs, testing/backup/vaultPlaintextExportGate.test.tsx |
| `ASR-1686` | Public-API-/Import-Boundary-Test ablegen. | **KEIN BELEG** |
| `ASR-1687` | Cosmic Obsidian visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1688` | Sovereign Gold visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1689` | Tactical Emerald visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1690` | Abyssal Sapphire visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1691` | Crimson Command visuell und funktional gegen das Theme-System testen. | testing/contract/vaultEvidenceCoverage.contract.test.mjs |
| `ASR-1692` | Arctic Daylight visuell und funktional gegen das Theme-System testen. | **KEIN BELEG** |
| `ASR-1693` | Locale DE auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/vaultBrowserLocale.render.test.tsx, testing/locale/vaultBackupLocale.render.test.tsx, testing/locale/vaultBackupEngineErrorLocale.render.test.tsx |
| `ASR-1694` | Locale EN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/vaultBrowserLocale.render.test.tsx, testing/locale/vaultBackupLocale.render.test.tsx, testing/locale/vaultBackupEngineErrorLocale.render.test.tsx |
| `ASR-1695` | Locale RU auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/vaultBrowserLocale.render.test.tsx, testing/locale/vaultBackupLocale.render.test.tsx, testing/locale/vaultBackupEngineErrorLocale.render.test.tsx |
| `ASR-1696` | Locale IT auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/vaultBrowserLocale.render.test.tsx, testing/locale/vaultBackupLocale.render.test.tsx, testing/locale/vaultBackupEngineErrorLocale.render.test.tsx |
| `ASR-1697` | Locale ES auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/vaultBrowserLocale.render.test.tsx, testing/locale/vaultBackupLocale.render.test.tsx, testing/locale/vaultBackupEngineErrorLocale.render.test.tsx |
| `ASR-1698` | Locale JA auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/vaultBrowserLocale.render.test.tsx, testing/locale/vaultBackupLocale.render.test.tsx, testing/locale/vaultBackupEngineErrorLocale.render.test.tsx |
| `ASR-1699` | Locale zh-CN auf harte Strings, Overflow, Clipping und Layout-Drift prüfen. | testing/locale/vaultBrowserLocale.render.test.tsx, testing/locale/vaultBackupLocale.render.test.tsx, testing/locale/vaultBackupEngineErrorLocale.render.test.tsx |
| `ASR-1700` | Spezialpfad `Unlock` nach dem Move funktional testen. | testing/files/vaultFolderMoveKeyboard.test.tsx |
| `ASR-1701` | Spezialpfad `Lock` nach dem Move funktional testen. | testing/files/vaultFolderMoveKeyboard.test.tsx, testing/security/vaultSessionLock.test.ts, testing/security/vaultLockRevocation.render.test.tsx |
| `ASR-1702` | Spezialpfad `Secret UI` nach dem Move funktional testen. | testing/files/vaultFolderMoveKeyboard.test.tsx, testing/actions/vaultActionsLayers.test.ts |
| `ASR-1703` | Spezialpfad `Protected Files` nach dem Move funktional testen. | testing/files/vaultFolderMoveKeyboard.test.tsx, testing/files/vaultFileSystemEngine.test.ts, testing/setup/vaultFirstRun.test.tsx |
| `ASR-1704` | Spezialpfad `Integrity UI` nach dem Move funktional testen. | testing/history/vaultVersionIntegrity.test.ts, testing/files/vaultFolderMoveKeyboard.test.tsx, testing/integrity/vaultRepairIntegrity.test.ts |
| `ASR-1705` | Spezialpfad `No plaintext leakage` nach dem Move funktional testen. | testing/backup/vaultPlaintextExportGate.test.tsx, testing/files/vaultFolderMoveKeyboard.test.tsx, testing/panels/vaultPanels.render.test.tsx |
| `ASR-1706` | Keyboard-/Focus-/Accessible-Name-Smoke ausführen. | testing/accessibility/vaultKeyboardFocusAccessibleNameRuntime.test.tsx (Verhaltensnachweis seit Runde 382: rendert `VaultFreeRuntime` in happy-dom, liest `document.activeElement` und die zugaenglichen Namen) |
| `ASR-1707` | Reduced-Motion-/High-Contrast-Smoke ausführen. | **KEIN BELEG** |
| `ASR-1708` | Bundle-/Lazy-Chunk-Verhalten vor/nach Refactor vergleichen. | **KEIN BELEG** |
| `ASR-1709` | Dead-/Duplicate-Code-Audit nach Moves wiederholen. | **KEIN BELEG** |
| `ASR-1710` | No-Functional-Change/Behavior-Parity-Test explizit dokumentieren. | **ARTEFAKT:** `testing/INVENTAR.md` (die Messung) |
| `ASR-1711` | Test- und Evidence-Pfade im zentralen Evidence-Index verlinken. | **KEIN BELEG** |
| `ASR-1712` | App-Gate nur bei vollständig grünem Testpaket PASS setzen. | testing/integrity/vaultRepairIntegrity.test.ts, testing/contract/vaultEvidenceCoverage.contract.test.mjs, testing/sync/vaultPeerSyncEngine.test.ts |

## Was diese Zuordnung ist - und was nicht

Sie ist ein KANDIDATENVERGLEICH: sie prueft, ob Woerter des Aufgabentextes im Testnamen oder
Testinhalt vorkommen. **Sie behauptet NICHT, dass der genannte Test die Anforderung erfuellt.**

Zeilen mit `KEIN TEST` sind der ehrliche Teil: fuer sie gibt es keinen Kandidaten, und damit
keinen Beleg. Sie duerfen nicht abgehakt werden.

Der naechste Schritt ist, die Kandidaten EINZELN zu pruefen - und die bestaetigten dann als
Beleg zu fuehren.
