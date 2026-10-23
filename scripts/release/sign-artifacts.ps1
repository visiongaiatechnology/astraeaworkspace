# Release readiness: Authenticode signing for the Astraea Workspace beta artifacts.
#
# This script does NOT claim a signature when none exists. Without a certificate it reports the
# concrete blocker and exits with code 2. It never logs a PFX password. Signing is a separate,
# explicit release gate (VGT-056 / FIND-001 / CHAIN-001).
param(
  [string]$ExePath = "",
  [string]$SetupPath = "",
  [string]$CertificateThumbprint = $env:ASTRAEA_SIGN_CERT_SHA1,
  [string]$PfxPath = $env:ASTRAEA_PFX_PATH,
  [string]$TimestampUrl = "http://timestamp.digicert.com",
  [switch]$DryRun,
  [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $ExePath) { $ExePath = Join-Path $repoRoot 'target\release\vgt-desktop.exe' }
if (-not $SetupPath) {
  $dist = Join-Path $repoRoot 'release\inno\dist'
  $SetupPath = Get-ChildItem -LiteralPath $dist -Filter '*-Setup.exe' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { $_.FullName }
}
if (-not $SetupPath -or -not (Test-Path -LiteralPath $SetupPath)) { throw "Installer not found; build it first ($SetupPath)" }
if (-not (Test-Path -LiteralPath $ExePath)) { throw "EXE not found: $ExePath" }

function Find-SignTool {
  $command = Get-Command 'signtool.exe' -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $kits = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending
  foreach ($kit in $kits) {
    $candidate = Join-Path $kit.FullName 'x64\signtool.exe'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return $null
}

function Get-SignatureState([string]$Path) {
  $signature = Get-AuthenticodeSignature -LiteralPath $Path
  return [ordered]@{
    path = $Path
    status = [string]$signature.Status
    signer = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
    timestamped = if ($signature.TimeStamperCertificate) { $true } else { $false }
  }
}

if ($VerifyOnly) {
  $states = @((Get-SignatureState $ExePath), (Get-SignatureState $SetupPath))
  $states | ForEach-Object { $_ | ConvertTo-Json -Compress }
  if (@($states | Where-Object { $_.status -ne 'Valid' }).Count -gt 0) {
    Write-Output 'SIGNING_READINESS: BLOCKED — artifacts are not validly signed (expected until a certificate is provisioned).'
    exit 2
  }
  Write-Output 'SIGNING_READINESS: OK — both artifacts have a valid Authenticode signature.'
  exit 0
}

$signtool = Find-SignTool
if (-not $signtool) {
  Write-Output 'SIGNING: BLOCKED — signtool.exe not found. Install "Windows SDK Signing Tools" (Windows Build Tools), then rerun.'
  exit 2
}
$hasThumbprint = -not [string]::IsNullOrWhiteSpace($CertificateThumbprint)
$hasPfx = -not [string]::IsNullOrWhiteSpace($PfxPath)
if (-not $hasThumbprint -and -not $hasPfx) {
  Write-Output 'SIGNING: BLOCKED — no certificate configured (ASTRAEA_SIGN_CERT_SHA1 or ASTRAEA_PFX_PATH + ASTRAEA_PFX_PASSWORD).'
  Write-Output 'See release/SIGNING.md. This is the documented open release gate FIND-001; nothing is marked as signed.'
  exit 2
}
if (-not (Test-Path -LiteralPath $signtool)) { throw "signtool path is invalid: $signtool" }
if ($hasPfx -and -not (Test-Path -LiteralPath $PfxPath)) { throw "PFX not found: $PfxPath" }

function Sign-Artifact([string]$Path) {
  $arguments = @('sign', '/fd', 'SHA256', '/tr', $TimestampUrl, '/td', 'SHA256')
  if ($hasPfx) {
    if ([string]::IsNullOrEmpty($env:ASTRAEA_PFX_PASSWORD)) { throw 'ASTRAEA_PFX_PASSWORD is required for PFX signing (never commit it).' }
    $arguments += @('/f', $PfxPath, '/p', $env:ASTRAEA_PFX_PASSWORD)
  } else {
    $arguments += @('/sha1', $CertificateThumbprint)
  }
  $arguments += $Path
  if ($DryRun) {
    $display = $arguments | ForEach-Object { if ($_ -eq $env:ASTRAEA_PFX_PASSWORD) { '<redacted>' } else { $_ } }
    Write-Output ("DRYRUN signtool " + ($display -join ' '))
    return
  }
  & $signtool @arguments
  if ($LASTEXITCODE -ne 0) { throw "signtool failed for $Path (exit $LASTEXITCODE)" }
}

$exeStateBefore = Get-SignatureState $ExePath
Write-Output ("SIGNING: EXE before = {0}" -f $exeStateBefore.status)
Sign-Artifact $ExePath
$exeStateAfter = Get-SignatureState $ExePath
Write-Output ("SIGNING: EXE after = {0} signer={1} timestamped={2}" -f $exeStateAfter.status, $exeStateAfter.signer, $exeStateAfter.timestamped)
if (-not $DryRun -and $exeStateAfter.status -ne 'Valid') { throw 'EXE signature is not valid after signing.' }

# The installer must contain the signed EXE. Rebuild the installer AFTER signing the EXE
# (`build-installer.ps1 -SkipBuild`), then sign the installer in a second call.
if (-not $DryRun) {
  $setupInfo = Get-Item -LiteralPath $SetupPath
  $exeInfo = Get-Item -LiteralPath $ExePath
  if ($setupInfo.LastWriteTime -lt $exeInfo.LastWriteTime) {
    $rebuild = @'
SIGNING: WARNING — the installer is older than the signed EXE.
Rebuild it now (build-installer.ps1 -SkipBuild), then sign the installer and re-run -VerifyOnly:
'@
    Write-Output $rebuild
    Write-Output '  .\release\inno\build-installer.ps1 -SkipBuild -Clean'
    Write-Output '  .\scripts\release\sign-artifacts.ps1'
    exit 3
  }
}
Sign-Artifact $SetupPath
$setupStateAfter = Get-SignatureState $SetupPath
Write-Output ("SIGNING: INSTALLER after = {0} signer={1} timestamped={2}" -f $setupStateAfter.status, $setupStateAfter.signer, $setupStateAfter.timestamped)
if (-not $DryRun -and $setupStateAfter.status -ne 'Valid') { throw 'Installer signature is not valid after signing.' }
Write-Output 'SIGNING: OK — both artifacts validly signed. Publish SHA-256 hashes and signature evidence in the release notes.'
exit 0
