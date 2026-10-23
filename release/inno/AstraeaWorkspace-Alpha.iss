; ============================================================================
; Astraea Workspace Alpha 0.1 — Inno Setup Installer (Windows x64)
;
; Produkt : Astraea Workspace Open Core (Alpha 0.1)
; Herausgeber: VisionGaiaTechnology (VGT)
; Design  : dunkles Graphit/Indigo mit feinem Gold-Akzent (GLASS-Grundsätze,
;           soweit Inno Setup sie zulässt: Materialscheibe, Hairlines, ruhige
;           Tiefe). KEINE Neon-/Cyberpunk-Optik, KEINE dekorativen Raster.
;
; COMPILER-VORAUSSETZUNG
;   Inno Setup 6.7.0+ oder 7.x.  Getestet mit Inno Setup 7.1.0.
;   (WizardStyle-Modifikatoren "dark", "hidebevels", "includetitlebar" sowie
;    WizardBackColor/WizardBackImageFile benötigen 6.7.0+.)
;
; METADATEN
;   Dieses Skript enthält KEINE hartkodierte Produktversion. Die Datei
;   build\generated-defines.iss wird von build-installer.ps1 aus
;   crates/vgt-desktop/tauri.conf.json (bzw. Cargo/UI-Metadaten) erzeugt und
;   liefert: AppVersion, AppDisplayVersion, AppFileVersion, AppVersionSlug,
;   SourceExe, SourceExeSha256, BundleWebView2, BundleVCRedist, BuildStamp.
;
; ASSETS
;   Alle Wizard-Bilder/Icons werden deterministisch von generate-assets.ps1
;   erzeugt (PowerShell 5.1 + System.Drawing, keine neuen Dependencies).
;
; SICHERHEIT / SCOPE
;   - keine Autostart-Einträge, keine Dienste, keine geplanten Aufgaben
;   - keine Übernahme fremder Office-Endungen (.docx/.xlsx/.pptx/.pdf)
;   - Dateizuordnungen nur optional per Task und nur für Astraea-Typen
;   - Workspace-Daten werden bei der Deinstallation NUR gelöscht, wenn der
;     Nutzer das im Deinstallationsdialog ausdrücklich ankreuzt (oder silent
;     per /DELETEAPPDATA); sonst bleiben sie erhalten
; ============================================================================

#include "build\generated-defines.iss"

#if VER < EncodeVer(6,7,0)
  #error Inno Setup 6.7.0 or newer is required for this script (tested with 7.1.0). Bitte Inno Setup aktualisieren: winget install JRSoftware.InnoSetup
#endif

[Setup]
; Stabile AppId (nie ändern: bestimmt Uninstall-Log und App-Erkennung).
AppId={{7D3E9B12-4C58-4A6F-9E1D-2B8C0A5F63D4}
AppName=Astraea Workspace Alpha
AppVersion={#AppVersion}
AppVerName=Astraea Workspace Alpha 0.1
AppPublisher=VisionGaiaTechnology
AppCopyright=Copyright (C) 2026 VisionGaiaTechnology (VGT)
VersionInfoCompany=VisionGaiaTechnology
VersionInfoDescription=Astraea Workspace Alpha Setup (Open Core)
VersionInfoProductName=Astraea Workspace Alpha
VersionInfoProductVersion={#AppFileVersion}
VersionInfoVersion={#AppFileVersion}
VersionInfoTextVersion={#AppFileVersion}
UninstallDisplayName=Astraea Workspace Alpha
UninstallDisplayIcon={app}\assets\astraea-uninstall.ico

DisableWelcomePage=no
DefaultDirName={autopf}\Astraea Workspace Alpha
DefaultGroupName=Astraea Workspace Alpha
DisableProgramGroupPage=yes
AllowNoIcons=yes

; Installation: systemweit (admin). /CURRENTUSER ist für Tests/Portable-Setups
; erlaubt; dann verwendet Inno automatisch den Benutzerbereich (HKA -> HKCU).
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=commandline
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763

; Ausgabe
OutputDir=dist
OutputBaseFilename=Astraea-Workspace-Alpha-{#AppVersionSlug}-Setup
Compression=lzma2/max
SolidCompression=yes

; Astraea-Design (Inno 6.7+/7.x): erzwungener dunkler Stil, bevel-frei,
; gestylte Titelleiste, eigene dunkle Hintergrundfarbe und eigene Bildwelt.
WizardStyle=modern dark hidebevels includetitlebar
WizardBackColor=#07080D
WizardBackImageFile=assets\wizard-back-100.png,assets\wizard-back-150.png,assets\wizard-back-200.png,assets\wizard-back-250.png
WizardImageFile=assets\wizard-image-100.bmp,assets\wizard-image-125.bmp,assets\wizard-image-150.bmp,assets\wizard-image-200.bmp,assets\wizard-image-250.bmp
WizardSmallImageFile=assets\wizard-small-100.bmp,assets\wizard-small-125.bmp,assets\wizard-small-150.bmp,assets\wizard-small-200.bmp,assets\wizard-small-250.bmp
WizardImageBackColor=#0B0D14
SetupIconFile=assets\astraea-setup.ico

; Alpha-/AGB-Seite (Sprachvarianten werden in [Languages] gesetzt)
LicenseFile=License-Alpha-DE.txt
InfoBeforeFile=Alpha-Hinweis-DE.txt
ShowLanguageDialog=yes

; Deinstallation / Zuordnungen / laufende Anwendung
Uninstallable=yes
ChangesAssociations=yes
CloseApplications=yes
RestartApplications=no
RestartIfNeededByRun=no
UsePreviousAppDir=yes
UsePreviousTasks=yes

[Languages]
Name: "de"; MessagesFile: "compiler:Languages\German.isl"; LicenseFile: "License-Alpha-DE.txt"; InfoBeforeFile: "Alpha-Hinweis-DE.txt"
Name: "en"; MessagesFile: "compiler:Default.isl"; LicenseFile: "License-Alpha-EN.txt"; InfoBeforeFile: "Alpha-Hinweis-EN.txt"

[Messages]
; Begrüßung und Abschluss im Astraea-Beta-Ton (Sprachpräfix = [Languages]-Name).
de.WelcomeLabel1=Willkommen bei Astraea Workspace Alpha
de.WelcomeLabel2=Dieser Assistent installiert Astraea Workspace Alpha 0.1 (Open Core) auf Ihrem Computer.%n%nDie Beta ist Testsoftware. Erstellen Sie vor der Installation eine Sicherung Ihrer Daten und lesen Sie die Hinweise auf den nächsten Seiten.
de.FinishedHeadingLabel=Installation von Astraea Workspace Alpha abgeschlossen
de.FinishedLabel=Astraea Workspace Alpha wurde erfolgreich installiert. Die Anwendung ist lokal-first und benötigt kein Cloud-Konto.%n%nBitte beachten Sie die Beta-Hinweise und erstellen Sie regelmäßig Sicherungen Ihrer Workspace-Daten.
de.BeveledLabel=Astraea Workspace Alpha 0.1  |  VisionGaiaTechnology
en.WelcomeLabel1=Welcome to Astraea Workspace Alpha
en.WelcomeLabel2=This wizard installs Astraea Workspace Alpha 0.1 (Open Core) on your computer.%n%nThis is beta software. Create a backup of your data before installing and read the notes on the following pages.
en.FinishedHeadingLabel=Completing Astraea Workspace Alpha Setup
en.FinishedLabel=Astraea Workspace Alpha has been installed successfully. The application is local-first and does not require a cloud account.%n%nPlease read the beta notes and back up your workspace data regularly.
en.BeveledLabel=Astraea Workspace Alpha 0.1  |  VisionGaiaTechnology

[CustomMessages]
; --- Aufgaben (Tasks) -------------------------------------------------------
de.TaskGroupAssoc=Dateizuordnungen:
de.TaskFileAssoc=Astraea-Dateitypen mit Astraea Workspace öffnen (.vwc, .vdoc, .vgrid, .vpresent, .vnote)
de.TaskGroupIcons=Zusätzliche Verknüpfungen:
de.TaskDesktopIcon=Desktop-Verknüpfung erstellen
de.TaskInstallShortcuts=Startmenü-Verknüpfung erstellen (empfohlen)
en.TaskGroupAssoc=File associations:
en.TaskFileAssoc=Open Astraea file types with Astraea Workspace (.vwc, .vdoc, .vgrid, .vpresent, .vnote)
en.TaskGroupIcons=Additional shortcuts:
en.TaskDesktopIcon=Create a desktop shortcut
en.TaskInstallShortcuts=Create a Start Menu shortcut (recommended)

; --- Verknüpfungen / ProgIDs ------------------------------------------------
de.AppShortcutComment=Astraea Workspace Alpha (Open Core) starten
de.UninstallShortcutName=Deinstallation Astraea Workspace Alpha
de.AssocVwcDesc=Astraea Workspace Container
de.AssocVdocDesc=Astraea Writer Dokument
de.AssocVgridDesc=Astraea Grid Arbeitsmappe
de.AssocVpresentDesc=Astraea Present Präsentation
de.AssocVnoteDesc=Astraea Notes Notizbuch
en.AppShortcutComment=Launch Astraea Workspace Alpha (Open Core)
en.UninstallShortcutName=Uninstall Astraea Workspace Alpha
en.AssocVwcDesc=Astraea Workspace Container
en.AssocVdocDesc=Astraea Writer document
en.AssocVgridDesc=Astraea Grid workbook
en.AssocVpresentDesc=Astraea Present presentation
en.AssocVnoteDesc=Astraea Notes notebook

; --- Systemprüfung ----------------------------------------------------------
de.SystemCheckPageCaption=Systemprüfung
de.SystemCheckPageDescription=Prüfung der Laufzeitumgebungen und Systemvoraussetzungen für Astraea Workspace Alpha.
de.CheckStatusOk=[ OK ]
de.CheckStatusMissing=[ FEHLT ]
de.CheckWindowsTitle=Windows-Version
de.CheckWindowsDetail=Windows %1.%2 · Build %3 · 64-bit
de.CheckWebView2Title=Microsoft Edge WebView2 Runtime
de.CheckWebView2OkDetail=Version %1
de.CheckWebView2MissingDetail=Nicht erkannt. Astraea Workspace benötigt die WebView2-Runtime (Bestandteil von Windows 10/11, normalerweise vorhanden).
de.CheckVCRedistTitle=Microsoft Visual C++ 2015–2022 Redistributable (x64)
de.CheckVCRedistOkDetail=Version %1
de.CheckVCRedistMissingDetail=Nicht erkannt. Die Anwendung benötigt die Visual C++-Runtime (x64).
de.CheckWebView2BundledHint=Die WebView2-Runtime ist im Installationspaket enthalten und kann am Ende der Installation installiert werden.
de.CheckVCRedistBundledHint=Die Visual C++-Runtime ist im Installationspaket enthalten und kann am Ende der Installation installiert werden.
de.CheckMissingWebView2Hint=Ohne WebView2-Runtime kann die Anwendung nicht starten. Die Installation kann trotzdem abgeschlossen werden; installieren Sie die Runtime anschließend über den offiziellen Microsoft-Link.
de.CheckMissingVCRedistHint=Ohne Visual C++-Runtime kann die Anwendung nicht starten. Die Installation kann trotzdem abgeschlossen werden; installieren Sie die Runtime anschließend über den offiziellen Microsoft-Link.
de.CheckSummaryNote=Die Installation ist auch bei fehlenden Laufzeiten möglich; die Anwendung startet erst, nachdem die fehlenden Komponenten installiert wurden.
de.DownloadWebView2=WebView2-Downloadseite öffnen
de.DownloadVCRedist=VC++-Downloadseite öffnen
de.ErrorOpenUrl=Der Browser konnte nicht geöffnet werden. Bitte öffnen Sie die Adresse manuell: %1
en.SystemCheckPageCaption=System check
en.SystemCheckPageDescription=Checking runtime environments and system requirements for Astraea Workspace Alpha.
en.CheckStatusOk=[ OK ]
en.CheckStatusMissing=[ MISSING ]
en.CheckWindowsTitle=Windows version
en.CheckWindowsDetail=Windows %1.%2 · build %3 · 64-bit
en.CheckWebView2Title=Microsoft Edge WebView2 Runtime
en.CheckWebView2OkDetail=Version %1
en.CheckWebView2MissingDetail=Not detected. Astraea Workspace requires the WebView2 runtime (part of Windows 10/11 and normally present).
en.CheckVCRedistTitle=Microsoft Visual C++ 2015–2022 Redistributable (x64)
en.CheckVCRedistOkDetail=Version %1
en.CheckVCRedistMissingDetail=Not detected. The application requires the Visual C++ runtime (x64).
en.CheckWebView2BundledHint=The WebView2 runtime is included in this installation package and can be installed at the end of setup.
en.CheckVCRedistBundledHint=The Visual C++ runtime is included in this installation package and can be installed at the end of setup.
en.CheckMissingWebView2Hint=The application cannot start without the WebView2 runtime. You may still finish setup and install the runtime afterwards via the official Microsoft link.
en.CheckMissingVCRedistHint=The application cannot start without the Visual C++ runtime. You may still finish setup and install the runtime afterwards via the official Microsoft link.
en.CheckSummaryNote=Setup can complete with missing runtimes; the application starts only after the missing components have been installed.
en.DownloadWebView2=Open WebView2 download page
en.DownloadVCRedist=Open VC++ download page
en.ErrorOpenUrl=The browser could not be opened. Please open this address manually: %1

; --- Laufzeiten-Nachinstallation ([Run]) ------------------------------------
de.RunInstallWebView2=Microsoft Edge WebView2 Runtime jetzt installieren (empfohlen)
de.StatusInstallWebView2=Microsoft Edge WebView2 Runtime wird installiert ...
de.RunInstallVCRedist=Microsoft Visual C++ Runtime jetzt installieren (empfohlen)
de.StatusInstallVCRedist=Microsoft Visual C++ Runtime wird installiert ...
de.RunLaunchApp=Astraea Workspace Alpha jetzt starten
en.RunInstallWebView2=Install the Microsoft Edge WebView2 runtime now (recommended)
en.StatusInstallWebView2=Installing the Microsoft Edge WebView2 runtime ...
en.RunInstallVCRedist=Install the Microsoft Visual C++ runtime now (recommended)
en.StatusInstallVCRedist=Installing the Microsoft Visual C++ runtime ...
en.RunLaunchApp=Launch Astraea Workspace Alpha now

; --- Deinstallation: Datenbehaltung -----------------------------------------
de.UninstallDataTitle=Astraea Workspace Alpha deinstallieren
de.UninstallDataInfo=Das Programm wird entfernt. Ihre Workspace-Daten und Wiederherstellungspunkte bleiben standardmäßig erhalten. Aktivieren Sie das Kontrollkästchen nur, wenn die lokalen Daten endgültig gelöscht werden sollen.
de.UninstallDataCheckbox=Workspace-Daten und Wiederherstellungspunkte endgültig löschen (nicht umkehrbar)
de.UninstallDataKeepNote=Ohne Aktivierung bleiben Ihre lokalen Workspace-Daten erhalten.
de.UninstallDataButton=Deinstallieren
de.UninstallDataCancel=Abbrechen
en.UninstallDataTitle=Uninstall Astraea Workspace Alpha
en.UninstallDataInfo=The program will be removed. Your workspace data and recovery points are kept by default. Only select the checkbox if the local data should be deleted permanently.
en.UninstallDataCheckbox=Permanently delete workspace data and recovery points (not reversible)
en.UninstallDataKeepNote=If not selected, your local workspace data remains on this device.
en.UninstallDataButton=Uninstall
en.UninstallDataCancel=Cancel

[Tasks]
Name: "startmenuicon"; Description: "{cm:TaskInstallShortcuts}"; GroupDescription: "{cm:TaskGroupIcons}"; Flags: checkedonce
Name: "desktopicon"; Description: "{cm:TaskDesktopIcon}"; GroupDescription: "{cm:TaskGroupIcons}"; Flags: checkedonce unchecked
Name: "fileassoc"; Description: "{cm:TaskFileAssoc}"; GroupDescription: "{cm:TaskGroupAssoc}"; Flags: checkedonce

[Files]
; Release-Binary (von build-installer.ps1 aus target/release; SHA256 in build-info)
Source: "{#SourceExe}"; DestDir: "{app}"; DestName: "vgt-desktop.exe"; Flags: ignoreversion
; Installer-Icons (UninstallDisplayIcon + Setup-Optik)
Source: "assets\astraea-setup.ico"; DestDir: "{app}\assets"; Flags: ignoreversion
Source: "assets\astraea-uninstall.ico"; DestDir: "{app}\assets"; Flags: ignoreversion
; Lizenz-/Beta-/Drittanbieter-Hinweise (lokal, offline lesbar)
Source: "License-Alpha-DE.txt"; DestDir: "{app}\docs"; Flags: ignoreversion
Source: "License-Alpha-EN.txt"; DestDir: "{app}\docs"; Flags: ignoreversion
Source: "Alpha-Hinweis-DE.txt"; DestDir: "{app}\docs"; Flags: ignoreversion
Source: "Alpha-Hinweis-EN.txt"; DestDir: "{app}\docs"; Flags: ignoreversion
Source: "..\..\LICENSE"; DestDir: "{app}\docs"; DestName: "LICENSE-AGPL-3.0.txt"; Flags: ignoreversion
Source: "..\..\NOTICE"; DestDir: "{app}\docs"; Flags: ignoreversion
; Optionale, vom Build-Skript bereitgestellte Laufzeit-Installer (nur wenn vorhanden)
#if BundleWebView2 == 1
Source: "vendor\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: dontcopy
#endif
#if BundleVCRedist == 1
Source: "vendor\VC_redist.x64.exe"; DestDir: "{tmp}"; Flags: dontcopy
#endif

[Icons]
Name: "{group}\Astraea Workspace Alpha"; Filename: "{app}\vgt-desktop.exe"; WorkingDir: "{app}"; Comment: "{cm:AppShortcutComment}"; Tasks: startmenuicon
Name: "{group}\{cm:UninstallShortcutName}"; Filename: "{uninstallexe}"; Tasks: startmenuicon
Name: "{autodesktop}\Astraea Workspace Alpha"; Filename: "{app}\vgt-desktop.exe"; WorkingDir: "{app}"; Comment: "{cm:AppShortcutComment}"; Tasks: desktopicon

; Dateizuordnungen: ausschließlich Astraea-eigene Endungen. Die Anwendung liest
; beim Start Dateipfade aus der Kommandozeile (main.rs: collect_startup_files,
; SUPPORTED_OPEN_EXTENSIONS) und öffnet sie. Fremde Office-Endungen werden
; bewusst NICHT übernommen.
[Registry]
; .vwc
Root: HKA; SubKey: "Software\Classes\.vwc"; ValueType: string; ValueName: ""; ValueData: "AstraeaWorkspace.vwc"; Flags: uninsdeletevalue; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\.vwc\OpenWithProgids"; ValueType: string; ValueName: "AstraeaWorkspace.vwc"; ValueData: ""; Flags: uninsdeletevalue; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\AstraeaWorkspace.vwc"; ValueType: string; ValueName: ""; ValueData: "{cm:AssocVwcDesc}"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\AstraeaWorkspace.vwc\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\vgt-desktop.exe,0"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\AstraeaWorkspace.vwc\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\vgt-desktop.exe"" ""%1"""; Flags: uninsdeletekey; Tasks: fileassoc
; .vdoc (Writer)
Root: HKA; SubKey: "Software\Classes\.vdoc"; ValueType: string; ValueName: ""; ValueData: "AstraeaWorkspace.vdoc"; Flags: uninsdeletevalue; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\.vdoc\OpenWithProgids"; ValueType: string; ValueName: "AstraeaWorkspace.vdoc"; ValueData: ""; Flags: uninsdeletevalue; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\AstraeaWorkspace.vdoc"; ValueType: string; ValueName: ""; ValueData: "{cm:AssocVdocDesc}"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\AstraeaWorkspace.vdoc\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\vgt-desktop.exe,0"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\AstraeaWorkspace.vdoc\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\vgt-desktop.exe"" ""%1"""; Flags: uninsdeletekey; Tasks: fileassoc
; .vgrid (Grid)
Root: HKA; SubKey: "Software\Classes\.vgrid"; ValueType: string; ValueName: ""; ValueData: "AstraeaWorkspace.vgrid"; Flags: uninsdeletevalue; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\.vgrid\OpenWithProgids"; ValueType: string; ValueName: "AstraeaWorkspace.vgrid"; ValueData: ""; Flags: uninsdeletevalue; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\AstraeaWorkspace.vgrid"; ValueType: string; ValueName: ""; ValueData: "{cm:AssocVgridDesc}"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\AstraeaWorkspace.vgrid\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\vgt-desktop.exe,0"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\AstraeaWorkspace.vgrid\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\vgt-desktop.exe"" ""%1"""; Flags: uninsdeletekey; Tasks: fileassoc
; .vpresent (Present)
Root: HKA; SubKey: "Software\Classes\.vpresent"; ValueType: string; ValueName: ""; ValueData: "AstraeaWorkspace.vpresent"; Flags: uninsdeletevalue; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\.vpresent\OpenWithProgids"; ValueType: string; ValueName: "AstraeaWorkspace.vpresent"; ValueData: ""; Flags: uninsdeletevalue; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\AstraeaWorkspace.vpresent"; ValueType: string; ValueName: ""; ValueData: "{cm:AssocVpresentDesc}"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\AstraeaWorkspace.vpresent\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\vgt-desktop.exe,0"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\AstraeaWorkspace.vpresent\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\vgt-desktop.exe"" ""%1"""; Flags: uninsdeletekey; Tasks: fileassoc
; .vnote (Notes)
Root: HKA; SubKey: "Software\Classes\.vnote"; ValueType: string; ValueName: ""; ValueData: "AstraeaWorkspace.vnote"; Flags: uninsdeletevalue; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\.vnote\OpenWithProgids"; ValueType: string; ValueName: "AstraeaWorkspace.vnote"; ValueData: ""; Flags: uninsdeletevalue; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\AstraeaWorkspace.vnote"; ValueType: string; ValueName: ""; ValueData: "{cm:AssocVnoteDesc}"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\AstraeaWorkspace.vnote\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\vgt-desktop.exe,0"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKA; SubKey: "Software\Classes\AstraeaWorkspace.vnote\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\vgt-desktop.exe"" ""%1"""; Flags: uninsdeletekey; Tasks: fileassoc

[Run]
; Laufzeiten nur anbieten, wenn sie fehlen UND im Paket enthalten sind.
; Benötigen administrative Rechte -> runascurrentuser; silent werden sie
; nicht ungefragt ausgeführt (skipifsilent).
#if BundleWebView2 == 1
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "{cm:StatusInstallWebView2}"; Description: "{cm:RunInstallWebView2}"; Flags: postinstall runascurrentuser waituntilterminated skipifsilent; Check: ShouldInstallWebView2
#endif
#if BundleVCRedist == 1
Filename: "{tmp}\VC_redist.x64.exe"; Parameters: "/install /quiet /norestart"; StatusMsg: "{cm:StatusInstallVCRedist}"; Description: "{cm:RunInstallVCRedist}"; Flags: postinstall runascurrentuser waituntilterminated skipifsilent; Check: ShouldInstallVCRedist
#endif
Filename: "{app}\vgt-desktop.exe"; Description: "{cm:RunLaunchApp}"; Flags: postinstall nowait skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\vgt-desktop.exe.WebView2"
Type: filesandordirs; Name: "{app}\WebView2"
; Nur installereigene Protokolle/Artefakte im Programmverzeichnis. Workspace-Daten
; liegen außerhalb von {app} und werden ausschließlich über die optionale,
; ausdrückliche Nutzerentscheidung im Deinstallationsdialog gelöscht.
Type: filesandordirs; Name: "{app}\logs"

[Code]
const
  WEBVIEW2_EDGE_CLIENT_KEY = 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  WEBVIEW2_DOWNLOAD_URL = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703';
  VCREDIST_DOWNLOAD_URL = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
  WORKSPACE_DATA_ROAMING = 'technology.visiongaia.astraea.workspace.opencore';
  WORKSPACE_DATA_LOCAL = 'technology.visiongaia.astraea.workspace.opencore';
  { KeyVault-Schluesselmaterial liegt bewusst unter %APPDATA%\vgt_workspace (nicht unter der
    Identifier-ID). Beim ausdruecklichen Loeschen der Workspace-Daten muss dieses Verzeichnis
    mit entfernt werden, sonst bleibt Schluesselmaterial/Recovery-Historie zurueck. }
  KEYVAULT_DATA_ROAMING = 'vgt_workspace';

var
  SystemCheckPage: TWizardPage;
  SystemCheckPageCreated: Boolean;
  WebView2Version: String;
  WebView2Detected: Boolean;
  VCRuntimeVersion: String;
  VCRuntimeDetected: Boolean;
  DetectionDone: Boolean;
  DeleteWorkspaceDataRequested: Boolean;

{ ---------------------------------------------------------------------------
  Laufzeit-Erkennung
  --------------------------------------------------------------------------- }

function WebView2BootstrapperBundled: Boolean;
begin
#if BundleWebView2 == 1
  Result := True;
#else
  Result := False;
#endif
end;

function VCRedistBootstrapperBundled: Boolean;
begin
#if BundleVCRedist == 1
  Result := True;
#else
  Result := False;
#endif
end;

function ScanWebView2InstallDir(const BaseDir: String): String;
var
  FindRec: TFindRec;
  Candidate: String;
begin
  Result := '';
  if not DirExists(BaseDir) then
    Exit;
  if FindFirst(AddBackslash(BaseDir) + '*', FindRec) then
  begin
    try
      repeat
        if (FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY <> 0) then
        begin
          Candidate := AddBackslash(BaseDir) + FindRec.Name;
          if FileExists(AddBackslash(Candidate) + 'msedgewebview2.exe') then
          begin
            Result := FindRec.Name;
            Exit;
          end;
        end;
      until not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end;
end;

function DetectWebView2Version: String;
var
  Value: String;
begin
  Result := '';
  { Maschinenweite Installation (32-bit- und 64-bit-Registrysicht) }
  if RegQueryStringValue(HKLM32, WEBVIEW2_EDGE_CLIENT_KEY, 'pv', Value) then
  begin
    Result := Value;
    Exit;
  end;
  if RegQueryStringValue(HKLM64, WEBVIEW2_EDGE_CLIENT_KEY, 'pv', Value) then
  begin
    Result := Value;
    Exit;
  end;
  { Benutzerinstallation }
  if RegQueryStringValue(HKCU32, WEBVIEW2_EDGE_CLIENT_KEY, 'pv', Value) then
  begin
    Result := Value;
    Exit;
  end;
  if RegQueryStringValue(HKCU64, WEBVIEW2_EDGE_CLIENT_KEY, 'pv', Value) then
  begin
    Result := Value;
    Exit;
  end;
  { Fallback: Installationsverzeichnis (Versionsordner enthält die Version) }
  Result := ScanWebView2InstallDir(ExpandConstant('{commonpf32}\Microsoft\EdgeWebView\Application'));
  if Result = '' then
    Result := ScanWebView2InstallDir(ExpandConstant('{commonpf64}\Microsoft\EdgeWebView\Application'));
end;

function DetectVCRuntimeVersion: String;
var
  Value: String;
  InstalledFlag: Cardinal;
begin
  Result := '';
  Value := '';
  if RegQueryDWordValue(HKLM64, 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64', 'Installed', InstalledFlag) then
  begin
    if (InstalledFlag = 1) and RegQueryStringValue(HKLM64, 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64', 'Version', Value) then
    begin
      Result := Value;
      Exit;
    end;
  end;
  if RegQueryDWordValue(HKLM32, 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64', 'Installed', InstalledFlag) then
  begin
    if (InstalledFlag = 1) and RegQueryStringValue(HKLM32, 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64', 'Version', Value) then
    begin
      Result := Value;
      Exit;
    end;
  end;
  if RegQueryStringValue(HKLM64, 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64', 'Version', Value) then
  begin
    Result := Value;
    Exit;
  end;
  if RegQueryStringValue(HKLM32, 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64', 'Version', Value) then
  begin
    Result := Value;
    Exit;
  end;
  if RegQueryStringValue(HKCU64, 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64', 'Version', Value) then
  begin
    Result := Value;
    Exit;
  end;
  if RegQueryStringValue(HKCU32, 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64', 'Version', Value) then
  begin
    Result := Value;
    Exit;
  end;
end;

procedure EnsureSystemDetected;
begin
  if DetectionDone then
    Exit;
  WebView2Version := DetectWebView2Version;
  WebView2Detected := WebView2Version <> '';
  VCRuntimeVersion := DetectVCRuntimeVersion;
  VCRuntimeDetected := VCRuntimeVersion <> '';
  DetectionDone := True;
  Log('Astraea setup: WebView2=' + WebView2Version + ' VC++=' + VCRuntimeVersion);
end;

{ ---------------------------------------------------------------------------
  Run-Check-Funktionen (nur nach erfolgreicher Installation aufgerufen)
  --------------------------------------------------------------------------- }

function ShouldInstallWebView2: Boolean;
begin
  EnsureSystemDetected;
  Result := (not WebView2Detected) and WebView2BootstrapperBundled;
end;

function ShouldInstallVCRedist: Boolean;
begin
  EnsureSystemDetected;
  Result := (not VCRuntimeDetected) and VCRedistBootstrapperBundled;
end;

{ ---------------------------------------------------------------------------
  Download-Schaltflächen (offizielle Microsoft-Links, Browser des Nutzers)
  --------------------------------------------------------------------------- }

procedure OpenDownloadUrl(const Url: String);
var
  ErrorCode: Integer;
begin
  if not ShellExec('open', Url, '', '', SW_SHOWNORMAL, ewNoWait, ErrorCode) then
    MsgBox(FmtMessage(ExpandConstant('{cm:ErrorOpenUrl}'), [Url]), mbError, MB_OK);
end;

procedure WebView2DownloadClick(Sender: TObject);
begin
  OpenDownloadUrl(WEBVIEW2_DOWNLOAD_URL);
end;

procedure VCRedistDownloadClick(Sender: TObject);
begin
  OpenDownloadUrl(VCREDIST_DOWNLOAD_URL);
end;

{ ---------------------------------------------------------------------------
  Eigene Seite "Systemprüfung" (nach der Info-/Beta-Hinweisseite)
  --------------------------------------------------------------------------- }

function AddStatusRow(const Page: TWizardPage; var Top: Integer; const Title, Detail: String; const Ok: Boolean): Integer;
var
  TitleLabel: TNewStaticText;
  DetailLabel: TNewStaticText;
  Marker: String;
begin
  if Ok then
    Marker := ExpandConstant('{cm:CheckStatusOk}')
  else
    Marker := ExpandConstant('{cm:CheckStatusMissing}');

  TitleLabel := TNewStaticText.Create(Page);
  TitleLabel.Parent := Page.Surface;
  TitleLabel.Left := 0;
  TitleLabel.Top := Top;
  TitleLabel.Width := Page.SurfaceWidth;
  TitleLabel.Height := ScaleY(20);
  TitleLabel.AutoSize := False;
  TitleLabel.WordWrap := False;
  TitleLabel.Caption := Marker + '  ' + Title;

  DetailLabel := TNewStaticText.Create(Page);
  DetailLabel.Parent := Page.Surface;
  DetailLabel.Left := ScaleX(12);
  DetailLabel.Top := Top + ScaleY(20);
  DetailLabel.Width := Page.SurfaceWidth - ScaleX(12);
  DetailLabel.Height := ScaleY(20);
  DetailLabel.AutoSize := False;
  DetailLabel.WordWrap := True;
  DetailLabel.Caption := Detail;

  Top := Top + ScaleY(48);
  Result := Top;
end;

procedure AddHintLabel(const Page: TWizardPage; var Top: Integer; const Text: String; const Height: Integer);
var
  LabelControl: TNewStaticText;
begin
  LabelControl := TNewStaticText.Create(Page);
  LabelControl.Parent := Page.Surface;
  LabelControl.Left := 0;
  LabelControl.Top := Top;
  LabelControl.Width := Page.SurfaceWidth;
  LabelControl.Height := ScaleY(Height);
  LabelControl.AutoSize := False;
  LabelControl.WordWrap := True;
  LabelControl.Caption := Text;
  Top := Top + ScaleY(Height) + ScaleY(4);
end;

procedure CreateSystemCheckPage;
var
  Page: TWizardPage;
  Top: Integer;
  WindowsVersion: TWindowsVersion;
  Button: TNewButton;
  WindowsDetail: String;
  WebView2Detail: String;
  VCRuntimeDetail: String;
begin
  EnsureSystemDetected;
  GetWindowsVersionEx(WindowsVersion);

  Page := CreateCustomPage(wpInfoBefore,
    ExpandConstant('{cm:SystemCheckPageCaption}'),
    ExpandConstant('{cm:SystemCheckPageDescription}'));
  SystemCheckPage := Page;
  SystemCheckPageCreated := True;

  WindowsDetail := FmtMessage(ExpandConstant('{cm:CheckWindowsDetail}'), [
    IntToStr(WindowsVersion.Major), IntToStr(WindowsVersion.Minor), IntToStr(WindowsVersion.Build)]);
  Top := 0;
  Top := AddStatusRow(Page, Top, ExpandConstant('{cm:CheckWindowsTitle}'), WindowsDetail, True);

  if WebView2Detected then
    WebView2Detail := FmtMessage(ExpandConstant('{cm:CheckWebView2OkDetail}'), [WebView2Version])
  else
    WebView2Detail := ExpandConstant('{cm:CheckWebView2MissingDetail}');
  Top := AddStatusRow(Page, Top, ExpandConstant('{cm:CheckWebView2Title}'), WebView2Detail, WebView2Detected);

  if VCRuntimeDetected then
    VCRuntimeDetail := FmtMessage(ExpandConstant('{cm:CheckVCRedistOkDetail}'), [VCRuntimeVersion])
  else
    VCRuntimeDetail := ExpandConstant('{cm:CheckVCRedistMissingDetail}');
  Top := AddStatusRow(Page, Top, ExpandConstant('{cm:CheckVCRedistTitle}'), VCRuntimeDetail, VCRuntimeDetected);

  if not WebView2Detected then
  begin
    if WebView2BootstrapperBundled then
      AddHintLabel(Page, Top, ExpandConstant('{cm:CheckWebView2BundledHint}'), 34)
    else
    begin
      AddHintLabel(Page, Top, ExpandConstant('{cm:CheckMissingWebView2Hint}'), 46);
      Button := TNewButton.Create(Page);
      Button.Parent := Page.Surface;
      Button.Left := 0;
      Button.Top := Top;
      Button.Width := Page.SurfaceWidth;
      Button.Height := ScaleY(25);
      Button.Caption := ExpandConstant('{cm:DownloadWebView2}');
      Button.OnClick := @WebView2DownloadClick;
      Top := Top + ScaleY(32);
    end;
  end;

  if not VCRuntimeDetected then
  begin
    if VCRedistBootstrapperBundled then
      AddHintLabel(Page, Top, ExpandConstant('{cm:CheckVCRedistBundledHint}'), 34)
    else
    begin
      AddHintLabel(Page, Top, ExpandConstant('{cm:CheckMissingVCRedistHint}'), 46);
      Button := TNewButton.Create(Page);
      Button.Parent := Page.Surface;
      Button.Left := 0;
      Button.Top := Top;
      Button.Width := Page.SurfaceWidth;
      Button.Height := ScaleY(25);
      Button.Caption := ExpandConstant('{cm:DownloadVCRedist}');
      Button.OnClick := @VCRedistDownloadClick;
      Top := Top + ScaleY(32);
    end;
  end;

  AddHintLabel(Page, Top, ExpandConstant('{cm:CheckSummaryNote}'), 34);
end;

{ ---------------------------------------------------------------------------
  Setup-Events
  --------------------------------------------------------------------------- }

function InitializeSetup: Boolean;
begin
  Log('Astraea setup: installer build=' + '{#BuildStamp}');
  Log('Astraea setup: payload sha256=' + '{#SourceExeSha256}');
  Result := True;
end;

procedure InitializeWizard;
begin
  CreateSystemCheckPage;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if SystemCheckPageCreated and (CurPageID = SystemCheckPage.ID) then
  begin
    EnsureSystemDetected;
    { Fehlende WebView2-Runtime: einmalige, ehrliche Warnung. In silent-/
      automatisierten Installationen nicht blockieren (dort entscheidet der
      Administrator über die Laufzeitbereitstellung). }
    if (not WebView2Detected) and (not WebView2BootstrapperBundled) and (not WizardSilent) then
      Result := MsgBox(ExpandConstant('{cm:CheckMissingWebView2Hint}'), mbConfirmation, MB_YESNO) = IDYES;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    { dontcopy-Dateien erst jetzt extrahieren: das temporaere Setup-Verzeichnis wird
      bei Setup-Ende automatisch bereinigt, die Postinstall-Checkboxen laufen davor. }
    if WebView2BootstrapperBundled then
      ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
    if VCRedistBootstrapperBundled then
      ExtractTemporaryFile('VC_redist.x64.exe');
  end;
end;

{ ---------------------------------------------------------------------------
  Deinstallation: optionale Datenbehaltung
  --------------------------------------------------------------------------- }

procedure DeleteWorkspaceData;
var
  RoamingRoot, LocalRoot, KeyVaultRoot: String;
begin
  RoamingRoot := ExpandConstant('{userappdata}\' + WORKSPACE_DATA_ROAMING);
  LocalRoot := ExpandConstant('{localappdata}\' + WORKSPACE_DATA_LOCAL);
  KeyVaultRoot := ExpandConstant('{userappdata}\' + KEYVAULT_DATA_ROAMING);
  if DirExists(RoamingRoot) then
  begin
    Log('Astraea uninstall: deleting workspace data ' + RoamingRoot);
    DelTree(RoamingRoot, True, True, True);
  end;
  if DirExists(LocalRoot) then
  begin
    Log('Astraea uninstall: deleting local workspace data ' + LocalRoot);
    DelTree(LocalRoot, True, True, True);
  end;
  if DirExists(KeyVaultRoot) then
  begin
    Log('Astraea uninstall: deleting KeyVault data ' + KeyVaultRoot);
    DelTree(KeyVaultRoot, True, True, True);
  end;
end;

function AskUninstallDataPolicy: Boolean;
var
  Form: TSetupForm;
  TitleLabel: TNewStaticText;
  InfoLabel: TNewStaticText;
  KeepLabel: TNewStaticText;
  CheckBox: TNewCheckBox;
  DeleteButton: TNewButton;
  CancelButton: TNewButton;
begin
  Result := False;
  Form := CreateCustomForm(ScaleX(460), ScaleY(224), False, False);
  try
    Form.Caption := ExpandConstant('{cm:UninstallDataTitle}');

    TitleLabel := TNewStaticText.Create(Form);
    TitleLabel.Parent := Form;
    TitleLabel.Left := ScaleX(16);
    TitleLabel.Top := ScaleY(14);
    TitleLabel.Width := Form.ClientWidth - ScaleX(32);
    TitleLabel.Height := ScaleY(24);
    TitleLabel.AutoSize := False;
    TitleLabel.Caption := ExpandConstant('{cm:UninstallDataTitle}');

    InfoLabel := TNewStaticText.Create(Form);
    InfoLabel.Parent := Form;
    InfoLabel.Left := ScaleX(16);
    InfoLabel.Top := ScaleY(46);
    InfoLabel.Width := Form.ClientWidth - ScaleX(32);
    InfoLabel.Height := ScaleY(64);
    InfoLabel.AutoSize := False;
    InfoLabel.WordWrap := True;
    InfoLabel.Caption := ExpandConstant('{cm:UninstallDataInfo}');

    CheckBox := TNewCheckBox.Create(Form);
    CheckBox.Parent := Form;
    CheckBox.Left := ScaleX(16);
    CheckBox.Top := ScaleY(118);
    CheckBox.Width := Form.ClientWidth - ScaleX(32);
    CheckBox.Height := ScaleY(42);
    CheckBox.Caption := ExpandConstant('{cm:UninstallDataCheckbox}');
    CheckBox.Checked := False;

    KeepLabel := TNewStaticText.Create(Form);
    KeepLabel.Parent := Form;
    KeepLabel.Left := ScaleX(16);
    KeepLabel.Top := ScaleY(160);
    KeepLabel.Width := Form.ClientWidth - ScaleX(32);
    KeepLabel.Height := ScaleY(20);
    KeepLabel.AutoSize := False;
    KeepLabel.Caption := ExpandConstant('{cm:UninstallDataKeepNote}');

    DeleteButton := TNewButton.Create(Form);
    DeleteButton.Parent := Form;
    DeleteButton.Caption := ExpandConstant('{cm:UninstallDataButton}');
    DeleteButton.ModalResult := mrOk;
    DeleteButton.Default := True;
    DeleteButton.Width := ScaleX(110);
    DeleteButton.Height := ScaleY(25);
    DeleteButton.Left := Form.ClientWidth - ScaleX(110 + 10 + 110 + 16);
    DeleteButton.Top := Form.ClientHeight - ScaleY(25 + 14);

    CancelButton := TNewButton.Create(Form);
    CancelButton.Parent := Form;
    CancelButton.Caption := ExpandConstant('{cm:UninstallDataCancel}');
    CancelButton.ModalResult := mrCancel;
    CancelButton.Cancel := True;
    CancelButton.Width := ScaleX(110);
    CancelButton.Height := ScaleY(25);
    CancelButton.Left := Form.ClientWidth - ScaleX(110 + 16);
    CancelButton.Top := Form.ClientHeight - ScaleY(25 + 14);

    Form.ActiveControl := CheckBox;
    if Form.ShowModal() = mrOk then
      Result := CheckBox.Checked;
  finally
    Form.Free();
  end;
end;

function InitializeUninstall: Boolean;
begin
  Result := True;
  DeleteWorkspaceDataRequested := False;

  { Unbeaufsichtigte Deinstallation: Daten nur bei explizitem
    /DELETEAPPDATA löschen; sonst bleiben die Workspace-Daten erhalten. }
  if UninstallSilent then
  begin
    DeleteWorkspaceDataRequested := Pos('/DELETEAPPDATA', GetCmdTail) > 0;
    if DeleteWorkspaceDataRequested then
      Log('Astraea uninstall: silent, deleteWorkspaceData=True')
    else
      Log('Astraea uninstall: silent, deleteWorkspaceData=False');
    Exit;
  end;

  if AskUninstallDataPolicy then
  begin
    DeleteWorkspaceDataRequested := True;
    Log('Astraea uninstall: user requested workspace data deletion');
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and DeleteWorkspaceDataRequested then
    DeleteWorkspaceData;
end;
