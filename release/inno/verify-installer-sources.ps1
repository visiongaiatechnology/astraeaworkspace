# verify-installer-sources.ps1 - statische Verifikation der Inno-Installer-Quellen
#
# Prueft ohne Inno Setup:
#   - PowerShell-Syntax aller Release-Skripte (Parser, keine Ausfuehrung)
#   - Versions-/Metadaten-Konsistenz (tauri.conf.json -> generated-defines.iss)
#   - SHA256-Bindung SourceExe -> generated-defines.iss
#   - .iss-Referenzen: Wizard-Bilder, Icons, Lizenzen, Info-Seiten, [Files]-Quellen
#   - Asset-Formate: BMP 24bpp + erwartete Groessen, PNG-Signatur/Groessen, ICO-Header
#   - Sicherheits-/Scope-Invarianten: keine Autostart-Eintraege, keine fremden
#     Office-Endungen, Dateizuordnungen nur fuer von der App unterstuetzte Typen,
#     Datenloeschung nur optional (/DELETEAPPDATA / Checkbox), Laufzeit-Checks
#   - Keine hartkodierte Produktversion im .iss
#
# Exitcodes: 0 = alle Checks PASS, 1 = mindestens ein Check FAIL.
[CmdletBinding()]
param(
  [string]$InnoDir = ''
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($InnoDir)) {
  $InnoDir = $PSScriptRoot
  if ([string]::IsNullOrWhiteSpace($InnoDir)) {
    $InnoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  }
}
$InnoDir = [System.IO.Path]::GetFullPath($InnoDir)
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $InnoDir '..\..'))
$issPath = Join-Path $InnoDir 'AstraeaWorkspace-Alpha.iss'
$definesPath = Join-Path $InnoDir 'build\generated-defines.iss'
$tauriPath = Join-Path $repoRoot 'crates\vgt-desktop\tauri.conf.json'
$mainRsPath = Join-Path $repoRoot 'crates\vgt-desktop\src\main.rs'
$exePath = Join-Path $repoRoot 'target\release\vgt-desktop.exe'

$script:Results = New-Object System.Collections.Generic.List[object]
function Add-Result([string]$name, [bool]$ok, [string]$detail) {
  $script:Results.Add([pscustomobject]@{ Name = $name; Ok = $ok; Detail = $detail })
  if ($ok) {
    Write-Host ('  [PASS] {0}' -f $name) -ForegroundColor Green
  } else {
    Write-Host ('  [FAIL] {0}: {1}' -f $name, $detail) -ForegroundColor Red
  }
}
function Add-Skip([string]$name, [string]$detail) {
  $script:Results.Add([pscustomobject]@{ Name = $name; Ok = $true; Detail = 'SKIP: ' + $detail; Skipped = $true })
  Write-Host ('  [SKIP] {0}: {1}' -f $name, $detail) -ForegroundColor DarkGray
}
function Read-Utf8([string]$path) {
  return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}
function Read-Bytes([string]$path) {
  return [System.IO.File]::ReadAllBytes($path)
}
function Resolve-InnoPath([string]$value) {
  $clean = $value.Trim()
  if ([string]::IsNullOrWhiteSpace($clean)) { return '' }
  return [System.IO.Path]::GetFullPath((Join-Path $InnoDir $clean))
}

Write-Host 'Astraea Installer-Quellpruefung' -ForegroundColor Cyan
Write-Host ('Repo: {0}' -f $repoRoot)
Write-Host ('Inno: {0}' -f $InnoDir)
Write-Host ''

# ---------------------------------------------------------------------------
# 1) PowerShell-Syntax
# ---------------------------------------------------------------------------
Write-Host '1) PowerShell-Syntax' -ForegroundColor Cyan
$psScripts = @('generate-assets.ps1', 'build-installer.ps1', 'verify-installer-sources.ps1')
$parseOk = $true
$parseDetails = New-Object System.Collections.Generic.List[string]
foreach ($name in $psScripts) {
  $path = Join-Path $InnoDir $name
  if (-not (Test-Path $path)) { $parseOk = $false; $parseDetails.Add("fehlt: $name"); continue }
  $tokens = $null
  $errors = $null
  $null = [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
  if ($errors -and $errors.Count -gt 0) {
    $parseOk = $false
    foreach ($error in $errors) { $parseDetails.Add(("{0}:{1}: {2}" -f $name, $error.Extent.StartLineNumber, $error.Message)) }
  }
}
Add-Result 'PowerShell-Parser (3 Skripte)' $parseOk (($parseDetails -join '; '))

# ---------------------------------------------------------------------------
# 2) Metadaten + generated-defines.iss
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '2) Metadaten und generierte Defines' -ForegroundColor Cyan
$tauriOk = $false
$tauriVersion = ''
$tauriProduct = ''
$tauriIdentifier = ''
try {
  $tauri = Get-Content $tauriPath -Raw | ConvertFrom-Json
  $tauriVersion = [string]$tauri.version
  $tauriProduct = [string]$tauri.productName
  $tauriIdentifier = [string]$tauri.identifier
  $tauriOk = (-not [string]::IsNullOrWhiteSpace($tauriVersion)) -and (-not [string]::IsNullOrWhiteSpace($tauriIdentifier))
} catch {
  Add-Result 'tauri.conf.json lesbar' $false $_.Exception.Message
}
Add-Result 'tauri.conf.json (version/identifier)' $tauriOk ("version=$tauriVersion id=$tauriIdentifier product=$tauriProduct")

$definesOk = $false
$defines = @{}
if (Test-Path $definesPath) {
  $defineText = Read-Utf8 $definesPath
  foreach ($match in [regex]::Matches($defineText, '(?m)^#define\s+([A-Za-z0-9_]+)\s+(?:"([^"]*)"|(-?\d+))')) {
    $key = $match.Groups[1].Value
    if ($match.Groups[2].Success) { $defines[$key] = $match.Groups[2].Value } else { $defines[$key] = $match.Groups[3].Value }
  }
  $definesOk = $defines.Count -ge 8
}
Add-Result 'build/generated-defines.iss vorhanden/parsebar' $definesOk ("Defines: " + (($defines.Keys | Sort-Object) -join ', '))

$requiredDefines = @('AppVersion', 'AppDisplayVersion', 'AppFileVersion', 'AppVersionSlug', 'SourceExe', 'SourceExeSha256', 'BundleWebView2', 'BundleVCRedist', 'BuildStamp')
$missingDefines = @($requiredDefines | Where-Object { -not $defines.ContainsKey($_) })
Add-Result 'Pflicht-Defines vorhanden' ($missingDefines.Count -eq 0) ("fehlen: " + ($missingDefines -join ', '))

$versionOk = $definesOk -and ($defines['AppVersion'] -eq $tauriVersion)
Add-Result 'AppVersion == tauri.conf.json version' $versionOk ("defines={0} tauri={1}" -f $defines['AppVersion'], $tauriVersion)

$fileVersionOk = $false
if ($defines.ContainsKey('AppFileVersion')) {
  $fileVersionOk = $defines['AppFileVersion'] -match '^\d+\.\d+\.\d+\.\d+$'
}
Add-Result 'AppFileVersion ist numerisch (x.y.z.w)' $fileVersionOk ([string]$defines['AppFileVersion'])

$slugOk = $false
if ($defines.ContainsKey('AppVersionSlug')) {
  $slugOk = $defines['AppVersionSlug'] -match '^[A-Za-z0-9._-]+$'
}
Add-Result 'AppVersionSlug dateinamentauglich' $slugOk ([string]$defines['AppVersionSlug'])

$exeOk = $false
$exeDetail = ''
if ($defines.ContainsKey('SourceExe')) {
  $sourceExe = $defines['SourceExe'].Replace('/', '\')
  $exeOk = Test-Path -LiteralPath $sourceExe -PathType Leaf
  if ($exeOk) {
    $hash = (Get-FileHash -LiteralPath $sourceExe -Algorithm SHA256).Hash
    $hashOk = ($hash -eq $defines['SourceExeSha256'])
    $exeOk = $exeOk -and $hashOk
    $exeDetail = ("{0} (Hash {1})" -f (Split-Path -Leaf $sourceExe), $(if ($hashOk) { 'stimmt' } else { "ABWEICHUNG: $hash <> $($defines['SourceExeSha256'])" }))
  } else {
    $exeDetail = "fehlt: $sourceExe"
  }
}
Add-Result 'SourceExe existiert + SHA256 gebunden' $exeOk $exeDetail

$vendorWebView2 = Join-Path $InnoDir 'vendor\MicrosoftEdgeWebview2Setup.exe'
$vendorVCRedist = Join-Path $InnoDir 'vendor\VC_redist.x64.exe'
$bundleOk = $true
if ($defines.ContainsKey('BundleWebView2')) { $bundleOk = $bundleOk -and (($defines['BundleWebView2'] -eq '1') -eq (Test-Path $vendorWebView2)) }
if ($defines.ContainsKey('BundleVCRedist')) { $bundleOk = $bundleOk -and (($defines['BundleVCRedist'] -eq '1') -eq (Test-Path $vendorVCRedist)) }
Add-Result 'Bundle-Defines konsistent mit vendor/' $bundleOk ("WebView2={0} VC++={1}" -f $defines['BundleWebView2'], $defines['BundleVCRedist'])

# ---------------------------------------------------------------------------
# 3) .iss Grundstruktur / Sicherheits-Invarianten
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '3) .iss Struktur und Invarianten' -ForegroundColor Cyan
$issOk = Test-Path $issPath
Add-Result '.iss vorhanden' $issOk $issPath
if (-not $issOk) { exit 1 }
$issText = Read-Utf8 $issPath

Add-Result '#include generated-defines.iss' ($issText -match '#include\s+"build\\generated-defines\.iss"') 'Include-Pfad'

$requiredDirectives = @(
  @{ Name = 'AppId (GUID, escaped brace)'; Pattern = '(?m)^AppId=\{\{' },
  @{ Name = 'AppVersion aus Defines'; Pattern = '(?m)^AppVersion=\{#' },
  @{ Name = 'Numeric VersionInfoVersion aus Defines'; Pattern = '(?m)^VersionInfoVersion=\{#' },
  @{ Name = 'OutputBaseFilename mit AppVersionSlug'; Pattern = '(?m)^OutputBaseFilename=.*\{#AppVersionSlug\}' },
  @{ Name = 'MinVersion 10.0.17763'; Pattern = '(?m)^MinVersion=10\.0\.17763' },
  @{ Name = 'ArchitecturesAllowed x64compatible'; Pattern = '(?m)^ArchitecturesAllowed=x64compatible' },
  @{ Name = '64-bit install mode'; Pattern = '(?m)^ArchitecturesInstallIn64BitMode=x64compatible' },
  @{ Name = 'PrivilegesRequired admin'; Pattern = '(?m)^PrivilegesRequired=admin' },
  @{ Name = 'ChangesAssociations'; Pattern = '(?m)^ChangesAssociations=yes' },
  @{ Name = 'Dark/WizardStyle'; Pattern = '(?m)^WizardStyle=modern dark' },
  @{ Name = 'WizardBackColor gesetzt'; Pattern = '(?m)^WizardBackColor=#' },
  @{ Name = 'WizardImageFile gesetzt'; Pattern = '(?m)^WizardImageFile=' },
  @{ Name = 'WizardSmallImageFile gesetzt'; Pattern = '(?m)^WizardSmallImageFile=' },
  @{ Name = 'WizardBackImageFile gesetzt'; Pattern = '(?m)^WizardBackImageFile=' },
  @{ Name = 'SetupIconFile gesetzt'; Pattern = '(?m)^SetupIconFile=' },
  @{ Name = 'LicenseFile gesetzt'; Pattern = '(?m)^LicenseFile=' },
  @{ Name = 'InfoBeforeFile gesetzt'; Pattern = '(?m)^InfoBeforeFile=' },
  @{ Name = 'WebView2-Erkennung (EdgeUpdate-Clientkey)'; Pattern = 'EdgeUpdate\\Clients\\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5\}' },
  @{ Name = 'VC++-Erkennung (Runtimes x64)'; Pattern = 'VisualStudio\\14\.0\\VC\\Runtimes\\x64' },
  @{ Name = 'Uninstall-Datenlogik (DelTree)'; Pattern = 'DelTree\(' },
  @{ Name = 'Silent-Datenflag /DELETEAPPDATA'; Pattern = '/DELETEAPPDATA' },
  @{ Name = 'Deinstallationsdialog Checkbox'; Pattern = 'TNewCheckBox' },
  @{ Name = 'InitializeUninstall'; Pattern = 'function InitializeUninstall: Boolean;' },
  @{ Name = 'CurUninstallStepChanged'; Pattern = 'procedure CurUninstallStepChanged' },
  @{ Name = 'ISCC-Versionssperre (6.7+)'; Pattern = '#if VER < EncodeVer\(6,7,0\)' }
)
$directiveFailed = New-Object System.Collections.Generic.List[string]
foreach ($check in $requiredDirectives) {
  if (-not ($issText -match $check.Pattern)) { $directiveFailed.Add($check.Name) }
}
Add-Result 'Pflicht-Direktiven/-Logik im .iss' ($directiveFailed.Count -eq 0) ("fehlen: " + ($directiveFailed -join ', '))

Add-Result 'Keine hartkodierte AppVersion' (-not ($issText -match '(?m)^AppVersion=(?!\{#)')) 'AppVersion nutzt {#AppVersion}'
Add-Result 'Keine hartkodierte VersionInfoVersion' (-not ($issText -match '(?m)^VersionInfoVersion=(?!\{#)')) 'VersionInfoVersion nutzt {#AppFileVersion}'
Add-Result 'Keine Autostart-Registry-Eintraege' (-not ($issText -match 'CurrentVersion\\+Run')) 'kein CurrentVersion\Run'
Add-Result 'Keine Uebernahme fremder Office-Endungen' (-not ($issText -match 'Software\\+Classes\\+\.(docx|xlsx|pptx|pdf)')) 'nur Astraea-Endungen'
# Innerhalb von [Code] darf keine Zeile mit '[' beginnen (Inno wertet sie sonst
# faelschlich als Section-Tag, auch in Pascal-Kommentaren).
$codeIndex = -1
$issLines = $issText -split "`r?`n"
for ($i = 0; $i -lt $issLines.Count; $i++) { if ($issLines[$i] -match '^\[Code\]') { $codeIndex = $i; break } }
$bracketLines = New-Object System.Collections.Generic.List[string]
if ($codeIndex -ge 0) {
  for ($i = $codeIndex + 1; $i -lt $issLines.Count; $i++) {
    if ($issLines[$i] -match '^\s*\[') { $bracketLines.Add(('L{0}' -f ($i + 1))) }
  }
}
Add-Result 'Keine Section-Tags innerhalb [Code]' ($bracketLines.Count -eq 0) ("Zeilen: " + ($bracketLines -join ', '))
Add-Result 'Keine Autostart-Aufgabe/kein Dienst' (-not ($issText -match '(?i)schtasks\.exe|New-Service')) 'kein Autostart'

$implOk = ($issText -match 'procedure CurStepChanged') -and ($issText -match 'ExtractTemporaryFile') -and ($issText -match 'function ShouldInstallWebView2') -and ($issText -match 'function ShouldInstallVCRedist')
Add-Result 'Laufzeit-Nachinstallation ([Run] + ExtractTemporaryFile)' $implOk 'ShouldInstallWebView2/VCRedist'

$langOk = ($issText -match '(?m)^Name:\s*"de";') -and ($issText -match '(?m)^Name:\s*"en";') -and ($issText -match '(?m)^de\.WelcomeLabel1=') -and ($issText -match '(?m)^en\.WelcomeLabel1=')
Add-Result 'Sprachvarianten DE (Default) + EN' $langOk 'de/en in [Languages], [Messages], [CustomMessages]'

# Verwendete {#Define}-Makros muessen definiert sein
$usedMacros = [regex]::Matches($issText, '\{#([A-Za-z0-9_]+)\}') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
$missingMacros = @($usedMacros | Where-Object { -not $defines.ContainsKey($_) })
Add-Result 'Alle {#Define}-Makros definiert' ($missingMacros.Count -eq 0) ("verwendet: " + ($usedMacros -join ', ') + $(if ($missingMacros.Count -gt 0) { ' | fehlen: ' + ($missingMacros -join ', ') } else { '' }))

# ---------------------------------------------------------------------------
# 4) Dateizuordnungen gegen echte App-Faehigkeit
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '4) Dateizuordnungen gegen App-Faehigkeit' -ForegroundColor Cyan
$supportedExts = @()
if (Test-Path $mainRsPath) {
  $mainRs = Read-Utf8 $mainRsPath
  $match = [regex]::Match($mainRs, '(?s)const SUPPORTED_OPEN_EXTENSIONS: &\[&str\] = &\[(.*?)\];')
  if ($match.Success) {
    $supportedExts = [regex]::Matches($match.Groups[1].Value, '"([A-Za-z0-9]+)"') | ForEach-Object { $_.Groups[1].Value.ToLowerInvariant() } | Sort-Object -Unique
  }
}
Add-Result 'SUPPORTED_OPEN_EXTENSIONS aus main.rs gelesen' ($supportedExts.Count -gt 0) (($supportedExts -join ', '))

$assocExts = [regex]::Matches($issText, 'Software\\+Classes\\+\\?\.([A-Za-z0-9]+)') | ForEach-Object { $_.Groups[1].Value.ToLowerInvariant() } | Sort-Object -Unique
$expectedAssoc = @('vdoc', 'vgrid', 'vnote', 'vpresent', 'vwc')
$assocOk = $true
$assocDetail = 'gefunden: ' + ($assocExts -join ', ')
foreach ($ext in $expectedAssoc) {
  if ($assocExts -notcontains $ext) { $assocOk = $false; $assocDetail += " | fehlt: $ext" }
  if ($supportedExts -notcontains $ext) { $assocOk = $false; $assocDetail += " | NICHT von App unterstuetzt: $ext" }
}
$unexpected = @($assocExts | Where-Object { $expectedAssoc -notcontains $_ })
if ($unexpected.Count -gt 0) { $assocOk = $false; $assocDetail += ' | unerwartet: ' + ($unexpected -join ', ') }
Add-Result 'Dateizuordnungen = 5 native App-Typen' $assocOk $assocDetail

$startupFilesOk = ($mainRs -match 'collect_startup_files') -and ($mainRs -match 'is_supported_open_path')
Add-Result 'App liest Startdateien (collect_startup_files)' $startupFilesOk 'main.rs Startdatei-Pfad vorhanden'

# ---------------------------------------------------------------------------
# 5) Asset-Referenzen und Formate
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '5) Asset-Referenzen und Formate' -ForegroundColor Cyan
function Get-ListDirective([string]$text, [string]$name) {
  $match = [regex]::Match($text, '(?m)^' + [regex]::Escape($name) + '=(.*)$')
  if (-not $match.Success) { return @() }
  return @($match.Groups[1].Value -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
}
function Get-SingleDirective([string]$text, [string]$name) {
  $match = [regex]::Match($text, '(?m)^' + [regex]::Escape($name) + '=(.*)$')
  if ($match.Success) { return $match.Groups[1].Value.Trim() }
  return ''
}
function Test-BmpFile([string]$path, [int]$expectedWidth, [int]$expectedHeight) {
  $bytes = Read-Bytes $path
  if ($bytes.Length -lt 54 -or $bytes[0] -ne 0x42 -or $bytes[1] -ne 0x4D) { return 'kein BMP' }
  $width = [BitConverter]::ToInt32($bytes, 18)
  $height = [BitConverter]::ToInt32($bytes, 22)
  $bits = [BitConverter]::ToUInt16($bytes, 28)
  if ($width -ne $expectedWidth -or $height -ne $expectedHeight) { return ("Groesse {0}x{1} statt {2}x{3}" -f $width, $height, $expectedWidth, $expectedHeight) }
  if ($bits -ne 24) { return ("BitCount {0} statt 24" -f $bits) }
  return ''
}
function Test-PngFile([string]$path, [int]$expectedWidth, [int]$expectedHeight) {
  $bytes = Read-Bytes $path
  if ($bytes.Length -lt 24 -or $bytes[1] -ne 0x50 -or $bytes[2] -ne 0x4E -or $bytes[3] -ne 0x47) { return 'kein PNG' }
  $width = ([int]$bytes[16] -shl 24) -bor ([int]$bytes[17] -shl 16) -bor ([int]$bytes[18] -shl 8) -bor [int]$bytes[19]
  $height = ([int]$bytes[20] -shl 24) -bor ([int]$bytes[21] -shl 16) -bor ([int]$bytes[22] -shl 8) -bor [int]$bytes[23]
  if ($width -ne $expectedWidth -or $height -ne $expectedHeight) { return ("Groesse {0}x{1} statt {2}x{3}" -f $width, $height, $expectedWidth, $expectedHeight) }
  return ''
}
function Test-IcoFile([string]$path) {
  $bytes = Read-Bytes $path
  if ($bytes.Length -lt 22) { return 'zu klein' }
  $reserved = [BitConverter]::ToUInt16($bytes, 0)
  $type = [BitConverter]::ToUInt16($bytes, 2)
  $count = [BitConverter]::ToUInt16($bytes, 4)
  if ($reserved -ne 0 -or $type -ne 1) { return 'kein ICO-Header' }
  if ($count -lt 5) { return ("nur {0} Eintraege" -f $count) }
  $has256 = $false
  for ($i = 0; $i -lt $count; $i++) {
    $offset = 6 + $i * 16
    if ($bytes[$offset] -eq 0 -and $bytes[$offset + 1] -eq 0) { $has256 = $true }
  }
  if (-not $has256) { return 'kein 256x256-Eintrag' }
  return ''
}

$assetProblems = New-Object System.Collections.Generic.List[string]

$wizardExpected = @{ '100' = @(202, 386); '125' = @(269, 515); '150' = @(336, 643); '200' = @(430, 824); '250' = @(534, 1022) }
$wizardFiles = Get-ListDirective $issText 'WizardImageFile'
foreach ($file in $wizardFiles) {
  $path = Resolve-InnoPath $file
  if (-not (Test-Path $path)) { $assetProblems.Add("fehlt: $file"); continue }
  $dpi = [regex]::Match((Split-Path -Leaf $file), '(\d+)').Groups[1].Value
  if ($wizardExpected.ContainsKey($dpi)) {
    $problem = Test-BmpFile $path $wizardExpected[$dpi][0] $wizardExpected[$dpi][1]
    if ($problem -ne '') { $assetProblems.Add("$file : $problem") }
  }
}
Add-Result ("WizardImageFile ({0} Dateien)" -f $wizardFiles.Count) ($wizardFiles.Count -ge 4 -and $assetProblems.Count -eq 0) (($assetProblems -join '; '))

$smallExpected = @{ '100' = 58; '125' = 77; '150' = 97; '200' = 124; '250' = 159 }
$smallFiles = Get-ListDirective $issText 'WizardSmallImageFile'
$smallProblems = New-Object System.Collections.Generic.List[string]
foreach ($file in $smallFiles) {
  $path = Resolve-InnoPath $file
  if (-not (Test-Path $path)) { $smallProblems.Add("fehlt: $file"); continue }
  $dpi = [regex]::Match((Split-Path -Leaf $file), '(\d+)').Groups[1].Value
  if ($smallExpected.ContainsKey($dpi)) {
    $problem = Test-BmpFile $path $smallExpected[$dpi] $smallExpected[$dpi]
    if ($problem -ne '') { $smallProblems.Add("$file : $problem") }
  }
}
Add-Result ("WizardSmallImageFile ({0} Dateien)" -f $smallFiles.Count) ($smallFiles.Count -ge 4 -and $smallProblems.Count -eq 0) (($smallProblems -join '; '))

$backExpected = @{ '100' = @(596, 432); '150' = @(994, 720); '200' = @(1272, 922); '250' = @(1630, 1148) }
$backFiles = Get-ListDirective $issText 'WizardBackImageFile'
$backProblems = New-Object System.Collections.Generic.List[string]
foreach ($file in $backFiles) {
  $path = Resolve-InnoPath $file
  if (-not (Test-Path $path)) { $backProblems.Add("fehlt: $file"); continue }
  $dpi = [regex]::Match((Split-Path -Leaf $file), '(\d+)').Groups[1].Value
  if ($backExpected.ContainsKey($dpi)) {
    $problem = Test-PngFile $path $backExpected[$dpi][0] $backExpected[$dpi][1]
    if ($problem -ne '') { $backProblems.Add("$file : $problem") }
  }
}
Add-Result ("WizardBackImageFile ({0} Dateien)" -f $backFiles.Count) ($backFiles.Count -ge 3 -and $backProblems.Count -eq 0) (($backProblems -join '; '))

$iconOk = $true
$iconDetail = ''
foreach ($directive in @('SetupIconFile')) {
  $value = Get-SingleDirective $issText $directive
  if ($value -eq '') { $iconOk = $false; $iconDetail += "$directive fehlt; "; continue }
  $path = Resolve-InnoPath $value
  $problem = If (Test-Path $path) { Test-IcoFile $path } Else { 'fehlt' }
  if ($problem -ne '') { $iconOk = $false; $iconDetail += "$directive ($value): $problem; " }
}
$iconOk = $iconOk -and ($issText -match 'UninstallDisplayIcon=\{app\}\\assets\\astraea-uninstall\.ico')
Add-Result 'Setup-/Uninstall-Icons (ICO, 256px)' $iconOk ($iconDetail.TrimEnd('; '))

$licenseFiles = @()
$licenseFiles += Get-SingleDirective $issText 'LicenseFile'
$licenseFiles += Get-SingleDirective $issText 'InfoBeforeFile'
foreach ($languageMatch in [regex]::Matches($issText, '(?m)^Name:\s*"[a-z]{2}";.*$')) {
  $line = $languageMatch.Value
  foreach ($pair in @(@('LicenseFile', '(\bLicenseFile:\s*"([^"]+)")'), @('InfoBeforeFile', '(\bInfoBeforeFile:\s*"([^"]+)")'))) {
    $m = [regex]::Match($line, $pair[1])
    if ($m.Success) { $licenseFiles += $m.Groups[2].Value }
  }
}
$licenseFiles = $licenseFiles | Where-Object { $_ } | Sort-Object -Unique
$licenseProblems = New-Object System.Collections.Generic.List[string]
foreach ($file in $licenseFiles) {
  $path = Resolve-InnoPath $file
  if (-not (Test-Path $path)) { $licenseProblems.Add("fehlt: $file"); continue }
  try {
    $content = Read-Utf8 $path
    if ($content.Length -lt 500) { $licenseProblems.Add("sehr kurz: $file") }
  } catch {
    $licenseProblems.Add("nicht UTF-8 lesbar: $file")
  }
}
Add-Result ("Lizenz-/Info-Dateien ({0})" -f $licenseFiles.Count) ($licenseFiles.Count -ge 4 -and $licenseProblems.Count -eq 0) (($licenseProblems -join '; '))

# [Files]-Quellen (relativ, ohne Defines)
$fileProblems = New-Object System.Collections.Generic.List[string]
$fileSources = [regex]::Matches($issText, '(?m)^Source:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$vendorNotBundled = ($defines['BundleWebView2'] -ne '1') -and ($defines['BundleVCRedist'] -ne '1')
foreach ($source in $fileSources) {
  if ($source.StartsWith('{#')) { continue }
  if ($source -match '^vendor\\') {
    if ($vendorNotBundled) { continue }
  }
  $path = Resolve-InnoPath $source
  if (-not (Test-Path $path)) { $fileProblems.Add("fehlt: $source") }
}
Add-Result ("[Files]-Quellen ({0})" -f $fileSources.Count) ($fileProblems.Count -eq 0) (($fileProblems -join '; '))

$baseAssets = @('assets\astraea-setup.ico', 'assets\astraea-uninstall.ico')
$assetMissing = @($baseAssets | Where-Object { -not (Test-Path (Resolve-InnoPath $_)) })
Add-Result 'Basis-Assets vorhanden' ($assetMissing.Count -eq 0) ("fehlen: " + ($assetMissing -join ', '))

# ---------------------------------------------------------------------------
# 6) Skript-Invarianten (Build-Skript)
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '6) Build-Skript-Invarianten' -ForegroundColor Cyan
$buildScriptPath = Join-Path $InnoDir 'build-installer.ps1'
$buildOk = Test-Path $buildScriptPath
$buildText = if ($buildOk) { Read-Utf8 $buildScriptPath } else { '' }
Add-Result 'build-installer.ps1 vorhanden' $buildOk $buildScriptPath
$buildChecks = @(
  @{ Name = 'ISCC-Suche in LocalAppData/InnoSetup7'; Pattern = 'InnoSetup7' },
  @{ Name = 'ISCC-Suche in Program Files'; Pattern = 'Inno Setup 7' },
  @{ Name = 'ISCC-Suche via Uninstall-Registry'; Pattern = 'InstallLocation' },
  @{ Name = 'Klarer Hinweis bei fehlendem ISCC (winget)'; Pattern = 'winget install JRSoftware\.InnoSetup' },
  @{ Name = 'Exitcode 2 bei fehlendem ISCC'; Pattern = 'exit 2' },
  @{ Name = 'Version aus tauri.conf.json'; Pattern = 'tauri\.conf\.json' },
  @{ Name = 'generated-defines.iss wird erzeugt'; Pattern = 'generated-defines\.iss' },
  @{ Name = 'Portable-ZIP-Fallback'; Pattern = 'Portable' },
  @{ Name = 'SHA256-Bindung'; Pattern = 'Get-FileHash' },
  @{ Name = 'cargo tauri build --no-bundle'; Pattern = 'tauri.*--no-bundle' }
)
$buildFailed = New-Object System.Collections.Generic.List[string]
foreach ($check in $buildChecks) {
  if (-not ($buildText -match $check.Pattern)) { $buildFailed.Add($check.Name) }
}
Add-Result 'Build-Skript enthaelt Pflichtpfade' ($buildFailed.Count -eq 0) ("fehlen: " + ($buildFailed -join ', '))

$generateScriptPath = Join-Path $InnoDir 'generate-assets.ps1'
$generateOk = (Test-Path $generateScriptPath) -and ((Read-Utf8 $generateScriptPath) -match 'System\.Drawing')
Add-Result 'generate-assets.ps1 (System.Drawing, keine Dependencies)' $generateOk 'Asset-Generator'

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host ''
$failed = @($script:Results | Where-Object { -not $_.Ok })
$skipped = @($script:Results | Where-Object { $_.PSObject.Properties['Skipped'] })
Write-Host ('ERGEBNIS: {0} Checks, {1} PASS, {2} FAIL, {3} SKIP' -f $script:Results.Count, ($script:Results.Count - $failed.Count), $failed.Count, $skipped.Count) -ForegroundColor $(if ($failed.Count -eq 0) { 'Green' } else { 'Red' })
if ($failed.Count -gt 0) {
  Write-Host 'Fehlgeschlagene Checks:' -ForegroundColor Red
  foreach ($fail in $failed) { Write-Host ('  - {0}: {1}' -f $fail.Name, $fail.Detail) -ForegroundColor Red }
  exit 1
}
Write-Host 'STATISCH: PASS (kein Ersatz fuer den echten ISCC-Compile/Install-Test)' -ForegroundColor Green
exit 0
