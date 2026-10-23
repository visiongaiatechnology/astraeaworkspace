# Release evidence: the uninstaller's data-retention policy against the REAL application data paths.
#
# The workspace data lives in three places (not only under the bundle identifier):
#   %APPDATA%\technology.visiongaia.astraea.workspace.opencore   (workspace-store, recovery)
#   %APPDATA%\vgt_workspace                                     (KeyVault key material/history)
#   %LOCALAPPDATA%\technology.visiongaia.astraea.workspace.opencore (WebView2 cache/profile)
# This smoke installs the real installer, writes probe files into all three, and verifies:
#   1) default uninstall keeps the data (retention), removes program files and the uninstall entry;
#   2) uninstall with /DELETEAPPDATA removes all three probe directories.
param(
  [string]$SetupPath = "",
  [string]$EvidencePath = ""
)
$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $SetupPath) {
  $SetupPath = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'release\inno\dist') -Filter '*-Setup.exe' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { $_.FullName }
}
if (-not $SetupPath -or -not (Test-Path -LiteralPath $SetupPath)) { throw "Setup not found: $SetupPath" }
if (-not $EvidencePath) { $EvidencePath = Join-Path ([System.IO.Path]::GetTempPath()) ("astraea-uninstall-policy-" + [guid]::NewGuid().ToString('N') + '.json') }
$installDir = Join-Path $env:LOCALAPPDATA 'Programs\Astraea Workspace Alpha'
$roamingRoot = Join-Path $env:APPDATA 'technology.visiongaia.astraea.workspace.opencore'
$keyVaultRoot = Join-Path $env:APPDATA 'vgt_workspace'
$localRoot = Join-Path $env:LOCALAPPDATA 'technology.visiongaia.astraea.workspace.opencore'
$probeName = 'release-uninstall-policy-probe.txt'

$result = [ordered]@{
  schema = 'astraea.release.uninstall-data-policy/1'
  createdAt = (Get-Date).ToString('o')
  setup = (Resolve-Path -LiteralPath $SetupPath).Path
  setupSha256 = (Get-FileHash -LiteralPath $SetupPath -Algorithm SHA256).Hash
  dataPaths = [ordered]@{ roamingStore = $roamingRoot; keyVault = $keyVaultRoot; localProfile = $localRoot }
  steps = [ordered]@{}
}

function Install-Quiet([string]$setupPath, [string]$logPath) {
  $process = Start-Process -FilePath $setupPath -ArgumentList '/CURRENTUSER', '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/MERGETASKS="!desktopicon,!startmenuicon,!fileassoc"', "/LOG=$logPath" -Wait -PassThru
  return $process.ExitCode
}
function Uninstall-Quiet([string]$uninstaller, [string]$logPath, [switch]$DeleteAppData) {
  $arguments = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART')
  if ($DeleteAppData) { $arguments += '/DELETEAPPDATA' }
  $process = Start-Process -FilePath $uninstaller -ArgumentList $arguments -Wait -PassThru
  return $process.ExitCode
}
function Write-Probes {
  foreach ($root in @($roamingRoot, $keyVaultRoot, $localRoot)) {
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $root $probeName) -Value 'keep-or-delete-me' -Encoding utf8
  }
}
function Probe-States {
  $states = [ordered]@{}
  foreach ($pair in @(@('roamingStore', $roamingRoot), @('keyVault', $keyVaultRoot), @('localProfile', $localRoot))) {
    $states[$pair[0]] = Test-Path -LiteralPath (Join-Path $pair[1] $probeName)
  }
  return $states
}

$firstLog = Join-Path ([System.IO.Path]::GetTempPath()) ('astraea-uninstall-retention-' + [guid]::NewGuid().ToString('N') + '.log')
$secondLog = Join-Path ([System.IO.Path]::GetTempPath()) ('astraea-uninstall-deletion-' + [guid]::NewGuid().ToString('N') + '.log')

# SAFETY: this is a real-user install test. Any pre-existing app data in the three roots is moved to a
# temporary backup first and restored afterwards, so the test cannot destroy genuine local documents or
# KeyVault material on this machine. Probe files are created only inside the temporarily empty roots.
$backupRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('astraea-uninstall-backup-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backupRoot | Out-Null
$restorePlan = @{}
foreach ($pair in @(@('roamingStore', $roamingRoot), @('keyVault', $keyVaultRoot), @('localProfile', $localRoot))) {
  $name = $pair[0]
  $path = $pair[1]
  if (Test-Path -LiteralPath $path) {
    $backupPath = Join-Path $backupRoot $name
    Move-Item -LiteralPath $path -Destination $backupPath -Force
    $restorePlan[$name] = [ordered]@{ original = $path; backup = $backupPath }
  } else {
    $restorePlan[$name] = [ordered]@{ original = $path; backup = $null }
  }
}
$result.steps.preExistingDataBackedUp = @($restorePlan.Keys | Where-Object { $restorePlan[$_].backup })

try {
  # --- cycle 1: retention (default uninstall) ---
  $result.steps.installForRetention = [ordered]@{ exitCode = (Install-Quiet $SetupPath $firstLog) }
  Write-Probes
  $result.steps.probesBeforeRetentionUninstall = Probe-States
  $uninstaller = Join-Path $installDir 'unins000.exe'
  $result.steps.retentionUninstall = [ordered]@{ exitCode = (Uninstall-Quiet $uninstaller $firstLog) }
  Start-Sleep -Seconds 2
  $result.steps.installDirRemovedAfterRetention = -not (Test-Path -LiteralPath $installDir)
  $result.steps.probesAfterRetentionUninstall = Probe-States
  $result.steps.retentionKeptAll = (@($result.steps.probesAfterRetentionUninstall.Values | Where-Object { $_ -ne $true }).Count -eq 0)

  # --- cycle 2: explicit deletion (/DELETEAPPDATA) ---
  $result.steps.installForDeletion = [ordered]@{ exitCode = (Install-Quiet $SetupPath $secondLog) }
  Write-Probes
  $result.steps.probesBeforeDeletionUninstall = Probe-States
  $uninstaller = Join-Path $installDir 'unins000.exe'
  $result.steps.deletionUninstall = [ordered]@{ exitCode = (Uninstall-Quiet $uninstaller $secondLog -DeleteAppData) }
  Start-Sleep -Seconds 2
  $result.steps.installDirRemovedAfterDeletion = -not (Test-Path -LiteralPath $installDir)
  $result.steps.probesAfterDeletionUninstall = Probe-States
  $result.steps.deletionRemovedAll = (@($result.steps.probesAfterDeletionUninstall.Values | Where-Object { $_ -ne $false }).Count -eq 0)
  $result.steps.registryEntryRemoved = ((Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -eq 'Astraea Workspace Alpha' } | Measure-Object).Count -eq 0)
  $result.steps.logErrors = @(
    (Select-String -LiteralPath $firstLog -Pattern 'Error|Failed' -ErrorAction SilentlyContinue | Measure-Object).Count,
    (Select-String -LiteralPath $secondLog -Pattern 'Error|Failed' -ErrorAction SilentlyContinue | Measure-Object).Count
  )
  $passed = (
    $result.steps.installForRetention.exitCode -eq 0 -and
    $result.steps.retentionUninstall.exitCode -eq 0 -and
    $result.steps.installDirRemovedAfterRetention -and
    $result.steps.retentionKeptAll -and
    $result.steps.installForDeletion.exitCode -eq 0 -and
    $result.steps.deletionUninstall.exitCode -eq 0 -and
    $result.steps.installDirRemovedAfterDeletion -and
    $result.steps.deletionRemovedAll -and
    $result.steps.registryEntryRemoved -and
    $result.steps.logErrors[0] -eq 0 -and $result.steps.logErrors[1] -eq 0
  )
  $result.passed = $passed
} catch {
  $result.error = $_.Exception.Message
  $result.passed = $false
} finally {
  # never leave a half-installed app or probes behind
  if (Test-Path -LiteralPath (Join-Path $installDir 'unins000.exe')) {
    Uninstall-Quiet (Join-Path $installDir 'unins000.exe') $secondLog -DeleteAppData | Out-Null
  }
  foreach ($root in @($roamingRoot, $keyVaultRoot, $localRoot)) {
    $probe = Join-Path $root $probeName
    if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue }
  }
  Start-Sleep -Milliseconds 500
  # restore the user's pre-existing data exactly as it was; never leave backups orphaned
  foreach ($name in @('roamingStore', 'keyVault', 'localProfile')) {
    $plan = $restorePlan[$name]
    if (-not $plan -or -not $plan.backup) { continue }
    $current = $plan.original
    if (Test-Path -LiteralPath $current) { Remove-Item -LiteralPath $current -Recurse -Force -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $plan.backup) { Move-Item -LiteralPath $plan.backup -Destination $current -Force }
  }
  if (Test-Path -LiteralPath $backupRoot) { Remove-Item -LiteralPath $backupRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
if ($result.passed) {
  Write-Output 'UNINSTALL_DATA_POLICY: PASS - default uninstall kept all probes, /DELETEAPPDATA removed store, KeyVault and local profile probes'
  Write-Output ("EVIDENCE: {0}" -f $EvidencePath)
  exit 0
}
$failure = if ($result.Contains('error')) { $result.error } else { 'see evidence' }
Write-Output ("UNINSTALL_DATA_POLICY: FAIL - {0}" -f $failure)
Write-Output ("EVIDENCE: {0}" -f $EvidencePath)
exit 1
