# build-installer.ps1 - Astraea Workspace Alpha 0.1 Windows-Release-Build
#
# Baut reproduzierbar:
#   1) Projektmetadaten lesen (tauri.conf.json / Cargo.toml / ui/package.json)
#   2) optional UI + Release-EXE bauen (cargo tauri build --no-bundle)
#   3) Inno-Design-Assets erzeugen (generate-assets.ps1, System.Drawing)
#   4) build/generated-defines.iss aus den Metadaten erzeugen (keine Version hartkodiert)
#   5) Portable-ZIP als Fallback (kein Installer noetig)
#   6) ISCC.exe finden (Inno Setup 6.7+ / 7.x) und Installer kompilieren
#   7) Hashes + BUILD-INFO schreiben
#
# Aufruf (Beispiele):
#   powershell -NoProfile -ExecutionPolicy Bypass -File build-installer.ps1
#   ... -SkipBuild                 # vorhandene Release-EXE verwenden
#   ... -SkipBuild -PortableOnly   # nur Portable-ZIP + Hashes (kein ISCC noetig)
#   ... -ForceUiBuild              # UI-Build erzwingen
#   ... -IsccPath "C:\...\ISCC.exe"
#   ... -FetchRuntimeBootstrappers # WebView2/VC++ Bootstrapper offiziell laden (optional)
#
# Exitcodes: 0 = Erfolg, 2 = ISCC/Inno Setup fehlt, 3 = Build/EXE-Problem,
#            4 = Asset-/Referenz-/Validierungsfehler, 5 = ISCC-Compile-Fehler.
[CmdletBinding()]
param(
  [string]$AppVersion = '',
  [string]$ExePath = '',
  [string]$IsccPath = '',
  [switch]$SkipBuild,
  [switch]$ForceUiBuild,
  [switch]$SkipAssets,
  [switch]$PortableOnly,
  [switch]$NoPortable,
  [switch]$Clean,
  [switch]$FetchRuntimeBootstrappers
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$scriptDir = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($scriptDir)) {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDir '..\..'))
$buildDir = Join-Path $scriptDir 'build'
$distDir = Join-Path $scriptDir 'dist'
$assetsDir = Join-Path $scriptDir 'assets'
$vendorDir = Join-Path $scriptDir 'vendor'
$issPath = Join-Path $scriptDir 'AstraeaWorkspace-Alpha.iss'
$definesPath = Join-Path $buildDir 'generated-defines.iss'
$verifyScript = Join-Path $scriptDir 'verify-installer-sources.ps1'

function Write-Step([string]$text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }
function Write-Info([string]$text) { Write-Host "  $text" }
function Write-Warn([string]$text) { Write-Host "  WARN: $text" -ForegroundColor Yellow }
function Write-Ok([string]$text) { Write-Host "  OK: $text" -ForegroundColor Green }
function Stop-Build([string]$text, [int]$code) {
  Write-Host "`nFEHLER: $text" -ForegroundColor Red
  exit $code
}

function Read-TextFile([string]$path) {
  return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8NoBom([string]$path, [string]$content) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $encoding)
}

function Get-ShortHash([string]$path) {
  return (Get-FileHash -Path $path -Algorithm SHA256).Hash
}

function Get-TauriConfig([string]$root) {
  $configPath = Join-Path $root 'crates\vgt-desktop\tauri.conf.json'
  if (-not (Test-Path $configPath)) { Stop-Build "tauri.conf.json nicht gefunden: $configPath" 3 }
  $config = Get-Content $configPath -Raw | ConvertFrom-Json
  return [pscustomobject]@{ Path = $configPath; Config = $config }
}

function Get-WorkspaceCargoVersion([string]$root) {
  $cargoPath = Join-Path $root 'Cargo.toml'
  if (-not (Test-Path $cargoPath)) { return '' }
  $text = Read-TextFile $cargoPath
  $match = [regex]::Match($text, '(?ms)^\[workspace\.package\][\s\S]*?^version\s*=\s*"([^"]+)"')
  if ($match.Success) { return $match.Groups[1].Value }
  return ''
}

function Get-UiPackageVersion([string]$root) {
  $packagePath = Join-Path $root 'ui\package.json'
  if (-not (Test-Path $packagePath)) { return '' }
  try {
    $package = Get-Content $packagePath -Raw | ConvertFrom-Json
    return [string]$package.version
  } catch {
    return ''
  }
}

function Convert-ToFileVersion([string]$version) {
  $numbers = [regex]::Matches($version, '\d+') | ForEach-Object { $_.Value }
  $parts = New-Object System.Collections.Generic.List[int]
  foreach ($number in $numbers) {
    if ($parts.Count -ge 4) { break }
    $parts.Add([int]$number)
  }
  while ($parts.Count -lt 4) { $parts.Add(0) }
  return ($parts -join '.')
}

function Convert-ToSlug([string]$value) {
  $slug = [regex]::Replace($value, '[^A-Za-z0-9._-]+', '-')
  $slug = $slug.Trim('-', '.', '_')
  if ([string]::IsNullOrWhiteSpace($slug)) { return 'unknown' }
  return $slug
}

function Find-InnoSetup([string]$explicitPath) {
  $candidates = New-Object System.Collections.Generic.List[string]
  if (-not [string]::IsNullOrWhiteSpace($explicitPath)) { $candidates.Add($explicitPath) }
  $localPrograms = $env:LOCALAPPDATA
  if ($localPrograms) {
    foreach ($name in @('InnoSetup7', 'InnoSetup6', 'Inno Setup 7', 'Inno Setup 6')) {
      $candidates.Add((Join-Path $localPrograms ("Programs\{0}\ISCC.exe" -f $name)))
    }
  }
  foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
    if (-not $base) { continue }
    foreach ($name in @('Inno Setup 7', 'Inno Setup 6', 'Inno Setup 5')) {
      $candidates.Add((Join-Path $base ("{0}\ISCC.exe" -f $name)))
    }
  }
  foreach ($key in @(
      'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 7_is1',
      'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1',
      'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 7_is1',
      'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 7_is1',
      'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1',
      'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1')) {
    if (Test-Path $key) {
      $locationProps = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
      if ($locationProps -and $locationProps.PSObject.Properties['InstallLocation']) {
        $location = $locationProps.PSObject.Properties['InstallLocation'].Value
        if ($location) { $candidates.Add((Join-Path $location 'ISCC.exe')) }
      }
    }
  }
  $command = Get-Command 'ISCC.exe' -ErrorAction SilentlyContinue
  if ($command) { $candidates.Add($command.Source) }

  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return [System.IO.Path]::GetFullPath($candidate)
    }
  }
  return ''
}

function Get-InnoSetupDetails([string]$iscc) {
  $result = [pscustomobject]@{ Path = $iscc; Version = ''; Major = 0; Minor = 0 }
  $installDir = [System.IO.Path]::GetFullPath((Split-Path -Parent $iscc).TrimEnd('\'))
  # Kein Start von ISCC ohne Skript (ISCC liest sonst ggf. von stdin und kann
  # in piped Build-Umgebungen haengen). Version zuerst aus Installationsordner/Registry.
  $whatsNew = Join-Path $installDir 'whatsnew.htm'
  if (Test-Path $whatsNew) {
    $head = [System.IO.File]::ReadAllText($whatsNew)
    $versionMatch = [regex]::Match($head, 'Inno Setup\s+(\d+)(?:\.(\d+))?')
    if ($versionMatch.Success) {
      $result.Major = [int]$versionMatch.Groups[1].Value
      if ($versionMatch.Groups[2].Success) { $result.Minor = [int]$versionMatch.Groups[2].Value }
    }
  }
  $uninstallRoots = @(
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
  )
  foreach ($uninstallRoot in $uninstallRoots) {
    if (-not (Test-Path $uninstallRoot)) { continue }
    $entries = Get-ChildItem $uninstallRoot -ErrorAction SilentlyContinue
    foreach ($entry in $entries) {
      $props = Get-ItemProperty $entry.PSPath -ErrorAction SilentlyContinue
      if (-not $props) { continue }
      $locationProp = $props.PSObject.Properties['InstallLocation']
      $displayProp = $props.PSObject.Properties['DisplayName']
      $versionProp = $props.PSObject.Properties['DisplayVersion']
      if (-not $locationProp -or -not $locationProp.Value) { continue }
      if (-not $displayProp -or ($displayProp.Value -notlike '*Inno Setup*')) { continue }
      try {
        $locationDir = [System.IO.Path]::GetFullPath(([string]$locationProp.Value).TrimEnd('\'))
      } catch {
        continue
      }
      if ($locationDir -eq $installDir) {
        if ($versionProp) { $result.Version = [string]$versionProp.Value }
        $parts = ($result.Version -split '\.')
        if ($parts.Count -ge 1 -and $parts[0]) { $result.Major = [int]$parts[0] }
        if ($parts.Count -ge 2) { $result.Minor = [int]$parts[1] }
        return $result
      }
    }
  }
  return $result
}

function Test-FreshExeWarning([string]$exe, [string]$root) {
  if (-not (Test-Path $exe)) { return }
  $exeTime = (Get-Item $exe).LastWriteTimeUtc
  $watched = New-Object System.Collections.Generic.List[object]
  $uiIndex = Join-Path $root 'ui\dist\open-core\index.html'
  if (Test-Path $uiIndex) { $watched.Add((Get-Item $uiIndex)) }
  $desktopSrc = Join-Path $root 'crates\vgt-desktop\src'
  if (Test-Path $desktopSrc) {
    Get-ChildItem $desktopSrc -Recurse -File -Filter *.rs | ForEach-Object { $watched.Add($_) }
  }
  $tauriConf = Join-Path $root 'crates\vgt-desktop\tauri.conf.json'
  if (Test-Path $tauriConf) { $watched.Add((Get-Item $tauriConf)) }
  $newer = $watched | Where-Object { $_.LastWriteTimeUtc -gt $exeTime } | Select-Object -First 3
  if ($newer) {
    Write-Warn ("-SkipBuild: Release-EXE ist aelter als: " + (($newer | ForEach-Object { $_.FullName }) -join '; '))
  }
}

function Invoke-Native([string]$file, [string[]]$arguments, [string]$workDir, [int]$timeoutSeconds) {
  $start = New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName = $file
  $start.Arguments = ($arguments | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }) -join ' '
  $start.WorkingDirectory = $workDir
  $start.UseShellExecute = $false
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.CreateNoWindow = $true
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $start
  $null = $process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  if (-not $process.WaitForExit($timeoutSeconds * 1000)) {
    try { $process.Kill() } catch { }
    throw ("Timeout nach {0}s: {1}" -f $timeoutSeconds, $file)
  }
  $stdout = $stdoutTask.Result
  $stderr = $stderrTask.Result
  return [pscustomobject]@{ ExitCode = $process.ExitCode; StdOut = $stdout; StdErr = $stderr }
}

function New-DeterministicZip([string]$zipPath, [object[]]$entries) {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
  $stream = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::CreateNew)
  try {
    $archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $true)
    try {
      $fixedTime = [DateTimeOffset]::new(2026, 10, 18, 0, 0, 0, [TimeSpan]::Zero)
      foreach ($entry in $entries) {
        $zipEntry = $archive.CreateEntry($entry.EntryName, [System.IO.Compression.CompressionLevel]::Optimal)
        $zipEntry.LastWriteTime = $fixedTime
        $target = $zipEntry.Open()
        try {
          # Streaming statt ReadAllBytes: vermeidet grosse Einzelallokationen
          # (robust auch unter Speicherdruck auf kleinen Build-Maschinen).
          $sourceStream = [System.IO.File]::OpenRead($entry.SourcePath)
          try {
            $sourceStream.CopyTo($target)
          } finally {
            $sourceStream.Dispose()
          }
        } finally {
          $target.Dispose()
        }
      }
    } finally {
      $archive.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

# ---------------------------------------------------------------------------
# 1) Metadaten
# ---------------------------------------------------------------------------
Write-Step 'Projektmetadaten lesen'
$tauri = Get-TauriConfig $repoRoot
$tauriVersion = [string]$tauri.Config.version
$productName = [string]$tauri.Config.productName
$identifier = [string]$tauri.Config.identifier
$cargoVersion = Get-WorkspaceCargoVersion $repoRoot
$uiVersion = Get-UiPackageVersion $repoRoot
Write-Info ("tauri.conf.json version : {0}" -f $tauriVersion)
Write-Info ("Cargo [workspace.package]: {0}" -f $cargoVersion)
Write-Info ("ui/package.json version : {0}" -f $uiVersion)
Write-Info ("Produkt                 : {0}  ({1})" -f $productName, $identifier)
if ($cargoVersion -and ($cargoVersion -ne $tauriVersion)) {
  Write-Warn ("SOURCE_IDENTITY_CONFLICT: Cargo/UI ({0}) weicht von tauri.conf.json ({1}) ab." -f $cargoVersion, $tauriVersion)
  Write-Warn 'Der Installer verwendet tauri.conf.json, weil die gebaute EXE genau diese Version traegt.'
}
if ($uiVersion -and ($uiVersion -ne $tauriVersion)) {
  Write-Warn ("Hinweis: UI-Paketversion {0} ist nicht die Installer-Version (Quelle: tauri.conf.json)." -f $uiVersion)
}

$resolvedVersion = if ([string]::IsNullOrWhiteSpace($AppVersion)) { $tauriVersion } else { $AppVersion }
if ([string]::IsNullOrWhiteSpace($resolvedVersion)) { Stop-Build 'Keine App-Version ermittelbar (tauri.conf.json/uebergeben).' 3 }
$fileVersion = Convert-ToFileVersion $resolvedVersion
$versionSlug = Convert-ToSlug $resolvedVersion
$displayVersion = $resolvedVersion
Write-Info ("Installer-Version       : {0}  (FileVersion {1})" -f $resolvedVersion, $fileVersion)

# ---------------------------------------------------------------------------
# 2) Vorhandene EXE pruefen / bauen
# ---------------------------------------------------------------------------
Write-Step 'Release-EXE'
$resolvedExe = if ([string]::IsNullOrWhiteSpace($ExePath)) { Join-Path $repoRoot 'target\release\vgt-desktop.exe' } else { [System.IO.Path]::GetFullPath($ExePath) }
if ($SkipBuild) {
  if (-not (Test-Path $resolvedExe)) { Stop-Build ("-SkipBuild, aber Release-EXE fehlt: {0}" -f $resolvedExe) 3 }
  Test-FreshExeWarning $resolvedExe $repoRoot
  Write-Info ("verwende vorhandene EXE: {0}" -f $resolvedExe)
} else {
  $uiDir = Join-Path $repoRoot 'ui'
  $uiIndex = Join-Path $uiDir 'dist\open-core\index.html'
  $npm = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
  if (-not $npm) { $npm = Get-Command 'npm' -ErrorAction SilentlyContinue }
  if ($ForceUiBuild -or -not (Test-Path $uiIndex)) {
    if (-not $npm) { Stop-Build 'npm nicht gefunden; UI-Build nicht moeglich.' 3 }
    Write-Info 'UI-Build: npm run build:open-core'
    $uiResult = Invoke-Native $env:ComSpec @('/d', '/s', '/c', 'npm run build:open-core') $uiDir 900
    if ($uiResult.ExitCode -ne 0) { Stop-Build ("UI-Build fehlgeschlagen (exit {0}).`n{1}`n{2}" -f $uiResult.ExitCode, $uiResult.StdOut, $uiResult.StdErr) 3 }
    Write-Ok 'UI-Build abgeschlossen'
  } else {
    Write-Info 'UI-Dist vorhanden (kein ForceUiBuild): ui/dist/open-core/index.html'
  }

  $cargo = Get-Command 'cargo.exe' -ErrorAction SilentlyContinue
  if (-not $cargo) { Stop-Build 'cargo nicht gefunden; EXE-Build nicht moeglich.' 3 }
  Write-Info 'EXE-Build: cargo tauri build --no-bundle --no-sign --features open-core -- --no-default-features'
  $tauriResult = Invoke-Native $cargo.Source @('tauri', 'build', '--no-bundle', '--no-sign', '--features', 'open-core', '--', '--no-default-features') $repoRoot 2400
  if ($tauriResult.ExitCode -ne 0) {
    Write-Warn 'cargo tauri build fehlgeschlagen; Fallback: cargo build --release -p vgt-desktop'
    $fallback = Invoke-Native $cargo.Source @('build', '--release', '-p', 'vgt-desktop', '--features', 'open-core', '--no-default-features') $repoRoot 2400
    if ($fallback.ExitCode -ne 0) { Stop-Build ("EXE-Build fehlgeschlagen (cargo tauri exit {0}; cargo build exit {1}).`n{2}`n{3}" -f $tauriResult.ExitCode, $fallback.ExitCode, $tauriResult.StdErr, $fallback.StdErr) 3 }
  }
  if (-not (Test-Path $resolvedExe)) { Stop-Build ("Release-EXE nach Build nicht gefunden: {0}" -f $resolvedExe) 3 }
  Write-Ok 'Release-EXE gebaut'
}
$exeInfo = Get-Item $resolvedExe
$exeHash = Get-ShortHash $resolvedExe
$exeFileVersion = [string]$exeInfo.VersionInfo.FileVersion
Write-Info ("EXE  : {0} ({1:N0} B, FileVersion {2})" -f $exeInfo.FullName, $exeInfo.Length, $exeFileVersion)
Write-Info ("SHA256: {0}" -f $exeHash)
if ($exeFileVersion -and ($exeFileVersion -ne $resolvedVersion)) {
  Write-Warn ("EXE-FileVersion ({0}) weicht von Installer-Version ({1}) ab." -f $exeFileVersion, $resolvedVersion)
}

# ---------------------------------------------------------------------------
# 3) Verzeichnisse / Clean
# ---------------------------------------------------------------------------
Write-Step 'Arbeitsverzeichnisse'
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
if ($Clean) {
  Write-Info 'Clean: build/ und dist/ werden geleert (Assets werden neu erzeugt).'
  Get-ChildItem $buildDir -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
  Get-ChildItem $distDir -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
  New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
  New-Item -ItemType Directory -Force -Path $distDir | Out-Null
}

# ---------------------------------------------------------------------------
# 4) Assets
# ---------------------------------------------------------------------------
if (-not $PortableOnly) {
  Write-Step 'Inno-Design-Assets'
  if ($SkipAssets) {
    Write-Info 'Assets: -SkipAssets gesetzt (vorhandene Assets werden verwendet).'
  } else {
    $generateScript = Join-Path $scriptDir 'generate-assets.ps1'
    & $generateScript -OutputDir $assetsDir
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { Stop-Build ("Asset-Erzeugung fehlgeschlagen (exit {0})." -f $LASTEXITCODE) 4 }
    Write-Ok 'Assets erzeugt'
  }
}

# ---------------------------------------------------------------------------
# 5) Laufzeit-Bootstrapper (optional)
# ---------------------------------------------------------------------------
$webView2Bundled = $false
$vcRedistBundled = $false
if (-not $PortableOnly) {
  Write-Step 'Optionale Laufzeit-Installer'
  New-Item -ItemType Directory -Force -Path $vendorDir | Out-Null
  $webView2Bootstrapper = Join-Path $vendorDir 'MicrosoftEdgeWebview2Setup.exe'
  $vcRedist = Join-Path $vendorDir 'VC_redist.x64.exe'
  if ($FetchRuntimeBootstrappers) {
    $downloads = @(
      @{ Url = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703'; Path = $webView2Bootstrapper; Name = 'Microsoft Edge WebView2 Bootstrapper' },
      @{ Url = 'https://aka.ms/vs/17/release/vc_redist.x64.exe'; Path = $vcRedist; Name = 'Microsoft Visual C++ Redistributable (x64)' }
    )
    foreach ($download in $downloads) {
      try {
        Write-Info ("lade {0}" -f $download.Name)
        Invoke-WebRequest -Uri $download.Url -OutFile $download.Path -UseBasicParsing -TimeoutSec 180
        $signature = Get-AuthenticodeSignature -FilePath $download.Path
        if ($signature.Status -ne 'Valid') { Stop-Build ("Signaturpruefung fehlgeschlagen: {0} ({1})" -f $download.Path, $signature.Status) 3 }
        if ($signature.SignerCertificate.Subject -notmatch 'Microsoft') { Stop-Build ("Unerwarteter Signatur-Aussteller: {0}" -f $signature.SignerCertificate.Subject) 3 }
        $hash = Get-ShortHash $download.Path
        Write-Ok ("{0}: SHA256 {1}" -f $download.Name, $hash)
      } catch {
        Stop-Build ("Download fehlgeschlagen ({0}): {1}" -f $download.Name, $_.Exception.Message) 3
      }
    }
    $vendorHashes = @()
    if (Test-Path $webView2Bootstrapper) { $vendorHashes += ("{0}  {1}" -f (Get-ShortHash $webView2Bootstrapper), 'MicrosoftEdgeWebview2Setup.exe') }
    if (Test-Path $vcRedist) { $vendorHashes += ("{0}  {1}" -f (Get-ShortHash $vcRedist), 'VC_redist.x64.exe') }
    if ($vendorHashes.Count -gt 0) { Write-Utf8NoBom (Join-Path $vendorDir 'SHA256SUMS.txt') (($vendorHashes -join "`n") + "`n") }
  }
  if (Test-Path $webView2Bootstrapper) { $webView2Bundled = $true; Write-Info 'WebView2-Bootstrapper: gebuendelt' } else { Write-Info 'WebView2-Bootstrapper: nicht gebuendelt (Installer verweist auf offiziellen Download)' }
  if (Test-Path $vcRedist) { $vcRedistBundled = $true; Write-Info 'VC++-Redist: gebuendelt' } else { Write-Info 'VC++-Redist: nicht gebuendelt (Installer verweist auf offiziellen Download)' }
}

# ---------------------------------------------------------------------------
# 6) generated-defines.iss
# ---------------------------------------------------------------------------
$buildStamp = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
if (-not $PortableOnly) {
  Write-Step 'build/generated-defines.iss erzeugen'
  $defines = @()
  $defines += '; AUTO-GENERATED by release/inno/build-installer.ps1 - DO NOT EDIT'
  $defines += ('; Source: {0}' -f ($tauri.Path -replace '\\', '/'))
  $defines += ('#define AppVersion "{0}"' -f $resolvedVersion.Replace('"', ''))
  $defines += ('#define AppDisplayVersion "{0}"' -f $displayVersion.Replace('"', ''))
  $defines += ('#define AppFileVersion "{0}"' -f $fileVersion)
  $defines += ('#define AppVersionSlug "{0}"' -f $versionSlug)
  $defines += ('#define SourceExe "{0}"' -f ($exeInfo.FullName -replace '\\', '/').Replace('"', ''))
  $defines += ('#define SourceExeSha256 "{0}"' -f $exeHash)
  $defines += ('#define BundleWebView2 {0}' -f $(if ($webView2Bundled) { 1 } else { 0 }))
  $defines += ('#define BundleVCRedist {0}' -f $(if ($vcRedistBundled) { 1 } else { 0 }))
  $defines += ('#define BuildStamp "{0}"' -f $buildStamp)
  Write-Utf8NoBom $definesPath (($defines -join "`r`n") + "`r`n")
  Write-Ok ("Defines geschrieben: {0}" -f $definesPath)

  Write-Step 'Statische Quellpruefung (verify-installer-sources.ps1)'
  if (-not (Test-Path $verifyScript)) { Stop-Build ("Validator fehlt: {0}" -f $verifyScript) 4 }
  $verifyResult = Invoke-Native 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $verifyScript) $scriptDir 300
  Write-Host $verifyResult.StdOut
  if ($verifyResult.StdErr) { Write-Host $verifyResult.StdErr }
  if ($verifyResult.ExitCode -ne 0) { Stop-Build ("Statische Quellpruefung fehlgeschlagen (exit {0})." -f $verifyResult.ExitCode) 4 }
}

# ---------------------------------------------------------------------------
# 7) Portable-ZIP (Fallback ohne Installer)
# ---------------------------------------------------------------------------
$portableZip = ''
if (-not $NoPortable) {
  Write-Step 'Portable-ZIP erzeugen'
  $portableRoot = Join-Path $buildDir 'portable'
  if (Test-Path $portableRoot) { Remove-Item -Recurse -Force $portableRoot }
  $docsDir = Join-Path $portableRoot 'docs'
  New-Item -ItemType Directory -Force -Path $docsDir | Out-Null
  Copy-Item -LiteralPath $resolvedExe -Destination (Join-Path $portableRoot 'vgt-desktop.exe')
  Copy-Item -LiteralPath (Join-Path $scriptDir 'License-Alpha-DE.txt') -Destination (Join-Path $docsDir 'License-Alpha-DE.txt')
  Copy-Item -LiteralPath (Join-Path $scriptDir 'License-Alpha-EN.txt') -Destination (Join-Path $docsDir 'License-Alpha-EN.txt')
  Copy-Item -LiteralPath (Join-Path $scriptDir 'Alpha-Hinweis-DE.txt') -Destination (Join-Path $docsDir 'Alpha-Hinweis-DE.txt')
  Copy-Item -LiteralPath (Join-Path $scriptDir 'Alpha-Hinweis-EN.txt') -Destination (Join-Path $docsDir 'Alpha-Hinweis-EN.txt')
  $rootLicense = Join-Path $repoRoot 'LICENSE'
  if (Test-Path $rootLicense) { Copy-Item -LiteralPath $rootLicense -Destination (Join-Path $docsDir 'LICENSE-AGPL-3.0.txt') }
  $rootNotice = Join-Path $repoRoot 'NOTICE'
  if (Test-Path $rootNotice) { Copy-Item -LiteralPath $rootNotice -Destination (Join-Path $docsDir 'NOTICE') }

  $portableReadme = @"
ASTRAEA WORKSPACE ALPHA 0.1 - PORTABLE-ZIP (Fallback ohne Installer)

Version: $resolvedVersion
Build:   $buildStamp
Quelle:  $($exeInfo.Name)  SHA256: $exeHash

Dieses ZIP ist der Installer-freie Fallback. Es enthaelt keine Installation,
keine Registry-Eintraege, keine Dateizuordnungen und keinen Autostart.

START
  vgt-desktop.exe im entpackten Ordner starten. Windows 10 (Build 17763)+ x64
  und die Microsoft Edge WebView2 Runtime werden benoetigt. Die Visual C++
  Runtime (x64) wird von der Anwendung vorausgesetzt.

DATEN
  Astraea Workspace ist lokal-first. Arbeitsdaten liegen weiterhin im
  Benutzerprofil (nicht im ZIP-Ordner):
    %APPDATA%\technology.visiongaia.astraea.workspace.opencore\workspace-store
      (verschluesselte Dokumentdateien, Recovery)
    %APPDATA%\vgt_workspace
      (KeyVault-Schluesselmaterial und Rotation-Historie)
    %LOCALAPPDATA%\technology.visiongaia.astraea.workspace.opencore
      (WebView2-Cache/Profil)
  Das ZIP ist daher kein "portables Datenverzeichnis"; es vermeidet nur die
  Installation. Bitte vor Nutzung ein Backup erstellen.
  Hinweis: Die WebView2-Runtime kann neben der EXE einen Ordner
  vgt-desktop.exe.WebView2 (Browser-Cache/Profil) anlegen. Das ist kein
  Dokumentinhalt; die Dokumente liegen ausschliesslich in den AppData-Pfaden.
  Es laeuft immer nur EINE Instanz; ein zweiter Start zeigt einen Hinweis,
  damit zwei Fenster nicht gleichzeitig dieselben Dokumente speichern.

BETA-HINWEIS
  Testsoftware ohne Gewaehrleistung. Die vollstaendigen Alpha-/AGB-Hinweise
  liegen in docs\License-Alpha-DE.txt und docs\License-Alpha-EN.txt.
  Lizenz: AGPL-3.0-only (docs\LICENSE-AGPL-3.0.txt).

EMPFOHLEN
  Fuer Startmenue-/Desktop-Verknuepfungen, Deinstallation und optionale
  Dateizuordnungen den Inno-Setup-Installer verwenden
  (Astraea-Workspace-Alpha-$versionSlug-Setup.exe). Das ZIP bleibt der
  dokumentierte Fallback.

Der Build ist UNSIGNIERT (kein Code-Signing in diesem Schritt).
"@
  Write-Utf8NoBom (Join-Path $portableRoot 'PORTABLE-README-DE.txt') $portableReadme

  $portableEntries = New-Object System.Collections.Generic.List[object]
  Get-ChildItem $portableRoot -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($portableRoot.Length + 1) -replace '\\', '/'
    $portableEntries.Add([pscustomobject]@{ EntryName = $relative; SourcePath = $_.FullName })
  }
  $portableZip = Join-Path $distDir ("Astraea-Workspace-Alpha-{0}-Portable.zip" -f $versionSlug)
  New-DeterministicZip $portableZip $portableEntries.ToArray()
  $portableHash = Get-ShortHash $portableZip
  Write-Ok ("Portable-ZIP: {0} ({1:N0} B, SHA256 {2})" -f $portableZip, (Get-Item $portableZip).Length, $portableHash)
}

if ($PortableOnly) {
  Write-Step 'Ergebnis (PortableOnly)'
  Write-Utf8NoBom (Join-Path $distDir 'SHA256SUMS.txt') (("$portableHash  " + (Split-Path $portableZip -Leaf) + "`n" + $exeHash + '  ' + $exeInfo.Name + "`n"))
  $portableInfo = @()
  $portableInfo += 'ASTRAEA WORKSPACE ALPHA 0.1 - PORTABLE BUILD (INSTALLER-FREIER FALLBACK)'
  $portableInfo += '=================================================================='
  $portableInfo += ('Build stamp     : {0}' -f $buildStamp)
  $portableInfo += ('App version     : {0} (Quelle: crates/vgt-desktop/tauri.conf.json)' -f $resolvedVersion)
  $portableInfo += ('Source EXE      : {0}' -f $exeInfo.FullName)
  $portableInfo += ('Source EXE SHA  : {0}' -f $exeHash)
  $portableInfo += ('Portable ZIP    : {0}' -f $portableZip)
  $portableInfo += ('Portable SHA256 : {0}' -f $portableHash)
  $portableInfo += ''
  $portableInfo += 'Inno-Setup-Installer wurde in diesem Lauf NICHT gebaut (PortableOnly).'
  $portableInfo += 'Alle Inno-Quellen/Assets liegen unter release/inno; siehe README.md.'
  Write-Utf8NoBom (Join-Path $distDir 'BUILD-INFO.txt') (($portableInfo -join "`r`n") + "`r`n")
  Write-Info ("Portable-ZIP : {0}" -f $portableZip)
  Write-Info ("Hash         : {0}" -f $portableHash)
  Write-Info ("Info         : {0}" -f (Join-Path $distDir 'BUILD-INFO.txt'))
  exit 0
}

# ---------------------------------------------------------------------------
# 8) ISCC finden und Installer kompilieren
# ---------------------------------------------------------------------------
Write-Step 'Inno Setup (ISCC) suchen'
$iscc = Find-InnoSetup $IsccPath
if ([string]::IsNullOrWhiteSpace($iscc)) {
  Write-Host ''
  Write-Host 'Inno Setup (ISCC.exe) wurde nicht gefunden.' -ForegroundColor Yellow
  Write-Host 'Der Installer kann auf dieser Maschine daher NICHT kompiliert werden.' -ForegroundColor Yellow
  Write-Host 'Alle Quellen, Assets und das Portable-ZIP sind vollstaendig erzeugt.' -ForegroundColor Yellow
  Write-Host ''
  Write-Host 'Installation (eine der Varianten):' -ForegroundColor Yellow
  Write-Host '  winget install JRSoftware.InnoSetup'
  Write-Host '  choco install innosetup -y'
  Write-Host '  https://jrsoftware.org/isdl.php  (Inno Setup 6.7+ oder 7.x)'
  Write-Host ''
  Write-Host 'Danach erneut: powershell -NoProfile -ExecutionPolicy Bypass -File build-installer.ps1 -SkipBuild'
  Write-Host ''
  Write-Host 'Geprueft wurden u. a.: Program Files (x86)/Inno Setup 6|7,' -ForegroundColor DarkGray
  Write-Host 'LocalAppData/Programs/InnoSetup6|7, Uninstall-Registry, PATH.' -ForegroundColor DarkGray
  exit 2
}
$innoDetails = Get-InnoSetupDetails $iscc
Write-Info ("ISCC: {0}" -f $iscc)
Write-Info ("Version: {0} (Major {1}, Minor {2})" -f $innoDetails.Version, $innoDetails.Major, $innoDetails.Minor)
if ($innoDetails.Major -lt 6 -or ($innoDetails.Major -eq 6 -and $innoDetails.Minor -gt 0 -and $innoDetails.Minor -lt 7)) {
  Stop-Build ("Inno Setup {0} ist zu alt; benoetigt wird 6.7.0+ oder 7.x." -f $innoDetails.Version) 2
}

$setupExe = Join-Path $distDir ("Astraea-Workspace-Alpha-{0}-Setup.exe" -f $versionSlug)
if (Test-Path $setupExe) { Remove-Item -LiteralPath $setupExe -Force }
Write-Step 'ISCC-Compile'
$compileResult = Invoke-Native $iscc @($issPath) $scriptDir 1200
Write-Host $compileResult.StdOut
if ($compileResult.StdErr) { Write-Host $compileResult.StdErr }
if ($compileResult.ExitCode -ne 0) {
  Stop-Build ("ISCC-Compile fehlgeschlagen (exit {0})." -f $compileResult.ExitCode) 5
}
if (-not (Test-Path $setupExe)) {
  $fallbackExe = Get-ChildItem $distDir -Filter '*Setup.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($fallbackExe) { $setupExe = $fallbackExe.FullName } else { Stop-Build 'ISCC meldete Erfolg, aber keine Setup-EXE gefunden.' 5 }
}
$setupInfo = Get-Item $setupExe
if ($setupInfo.Length -lt 1MB) { Stop-Build ("Setup-EXE unerwartet klein: {0} B" -f $setupInfo.Length) 5 }
$setupHash = Get-ShortHash $setupExe
Write-Ok ("Installer: {0} ({1:N0} B)" -f $setupInfo.FullName, $setupInfo.Length)
Write-Info ("SHA256 : {0}" -f $setupHash)

# ---------------------------------------------------------------------------
# 9) Hashes + Build-Info
# ---------------------------------------------------------------------------
Write-Step 'Hashes und BUILD-INFO schreiben'
$sums = @()
$sums += ('{0}  {1}' -f $setupHash, $setupInfo.Name)
if ($portableZip -and (Test-Path $portableZip)) { $sums += ('{0}  {1}' -f (Get-ShortHash $portableZip), (Split-Path $portableZip -Leaf)) }
$sums += ('{0}  {1}' -f $exeHash, $exeInfo.Name)
Write-Utf8NoBom (Join-Path $distDir 'SHA256SUMS.txt') (($sums -join "`n") + "`n")

$buildInfo = @()
$buildInfo += 'ASTRAEA WORKSPACE ALPHA 0.1 - WIN32 RELEASE BUILD INFO'
$buildInfo += '====================================================='
$buildInfo += ('Build stamp     : {0}' -f $buildStamp)
$buildInfo += ('Product         : {0}' -f $productName)
$buildInfo += ('Identifier      : {0}' -f $identifier)
$buildInfo += ('App version     : {0} (Quelle: crates/vgt-desktop/tauri.conf.json)' -f $resolvedVersion)
$buildInfo += ('File version    : {0}' -f $fileVersion)
$buildInfo += ('Cargo version   : {0}' -f $(if ($cargoVersion) { $cargoVersion } else { 'n/a' }))
$buildInfo += ('UI pkg version  : {0}' -f $(if ($uiVersion) { $uiVersion } else { 'n/a' }))
$buildInfo += ('Source EXE      : {0}' -f $exeInfo.FullName)
$buildInfo += ('Source EXE SHA  : {0}' -f $exeHash)
$buildInfo += ('Source EXE size : {0}' -f $exeInfo.Length)
$buildInfo += ('Source EXE ver  : {0}' -f $exeFileVersion)
$buildInfo += ('Inno ISCC       : {0}' -f $iscc)
$buildInfo += ('Inno version    : {0}' -f $innoDetails.Version)
$buildInfo += ('Bundle WebView2 : {0}' -f $webView2Bundled)
$buildInfo += ('Bundle VC++     : {0}' -f $vcRedistBundled)
$buildInfo += ('Installer       : {0}' -f $setupInfo.FullName)
$buildInfo += ('Installer size  : {0}' -f $setupInfo.Length)
$buildInfo += ('Installer SHA256: {0}' -f $setupHash)
if ($portableZip -and (Test-Path $portableZip)) {
  $buildInfo += ('Portable ZIP    : {0}' -f $portableZip)
  $buildInfo += ('Portable SHA256 : {0}' -f (Get-ShortHash $portableZip))
}
$buildInfo += ('OS              : {0}' -f [System.Environment]::OSVersion.VersionString)
$buildInfo += ('Host            : {0}' -f $env:COMPUTERNAME)
$buildInfo += ('PowerShell      : {0}' -f $PSVersionTable.PSVersion.ToString())
$buildInfo += ''
$buildInfo += 'HINWEIS: Dieser Build ist NICHT code-signiert. Signing/Attestierung ist'
$buildInfo += 'ein separater Release-Gate-Schritt (siehe README).'
Write-Utf8NoBom (Join-Path $distDir 'BUILD-INFO.txt') (($buildInfo -join "`r`n") + "`r`n")
Write-Ok ("BUILD-INFO: {0}" -f (Join-Path $distDir 'BUILD-INFO.txt'))

Write-Step 'Ergebnis'
Write-Info ("Installer   : {0}" -f $setupExe)
if ($portableZip) { Write-Info ("Portable    : {0}" -f $portableZip) }
Write-Info ("Hashes      : {0}" -f (Join-Path $distDir 'SHA256SUMS.txt'))
Write-Ok 'Build erfolgreich abgeschlossen.'
exit 0
