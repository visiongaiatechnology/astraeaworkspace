# Release Beta 0.1 — native restart smoke (Lead-owned release evidence).
#
# Verifies the release blocker "start, open, close, restart" for the packaged desktop executable.
# It launches the app twice with an isolated, throw-away profile so it neither reads nor writes the
# user's real workspace, checks that a window with the expected title appears, then closes the
# process and confirms nothing is left behind. No input automation is attempted (a shared desktop
# must never receive synthetic clicks/keys); this only proves process/window lifecycle.
param(
  [string]$Executable = "",
  [int]$Rounds = 2,
  [int]$WindowTimeoutSeconds = 30,
  [string]$ExpectedTitle = "Astraea Workspace",
  [string]$EvidencePath = ""
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $Executable) {
  $Executable = Join-Path $repoRoot 'target\release\vgt-desktop.exe'
}
if (-not (Test-Path -LiteralPath $Executable)) {
  Write-Error "Release executable not found: $Executable"
  exit 2
}
if (-not $EvidencePath) {
  $EvidencePath = Join-Path ([System.IO.Path]::GetTempPath()) ("astraea-release-restart-" + [guid]::NewGuid().ToString('N') + ".json")
}

function Get-FreeProcessCount {
  return @(Get-Process -Name 'vgt-desktop*' -ErrorAction SilentlyContinue).Count
}

$roundsResult = @()
$baselineProcesses = Get-FreeProcessCount
for ($round = 1; $round -le $Rounds; $round += 1) {
  $profile = Join-Path ([System.IO.Path]::GetTempPath()) ("astraea-restart-profile-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $profile | Out-Null
  $startedAt = Get-Date
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Executable
  $psi.UseShellExecute = $false
  $psi.EnvironmentVariables['APPDATA'] = $profile
  $psi.EnvironmentVariables['LOCALAPPDATA'] = $profile
  $psi.EnvironmentVariables['USERPROFILE'] = $profile
  $process = [System.Diagnostics.Process]::Start($psi)
  $title = ''
  $deadline = (Get-Date).AddSeconds($WindowTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 400
    $process.Refresh()
    if ($process.HasExited) { break }
    $title = $process.MainWindowTitle
    if ($title -and $title -like "*$ExpectedTitle*") { break }
  }
  $process.Refresh()
  $alive = -not $process.HasExited
  $titleMatches = $alive -and $title -like "*$ExpectedTitle*"
  $roundsResult += [ordered]@{
    round            = $round
    startedAt        = $startedAt.ToString('o')
    aliveAfterStart  = $alive
    windowTitle      = $title
    windowTitleOk    = $titleMatches
    exitCode         = if ($process.HasExited) { $process.ExitCode } else { $null }
  }
  if (-not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
  Remove-Item -LiteralPath $profile -Recurse -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 1
$leftover = Get-FreeProcessCount - $baselineProcesses
$allOk = ($roundsResult | Where-Object { -not $_.windowTitleOk }).Count -eq 0 -and $leftover -eq 0
$evidence = [ordered]@{
  schema        = 'astraea.release.restart-smoke/1'
  createdAt     = (Get-Date).ToString('o')
  executable    = (Resolve-Path -LiteralPath $Executable).Path
  executableBytes = (Get-Item -LiteralPath $Executable).Length
  executableSha256 = (Get-FileHash -LiteralPath $Executable -Algorithm SHA256).Hash
  rounds        = $roundsResult
  leftoverProcesses = $leftover
  result        = if ($allOk) { 'PASS' } else { 'FAIL' }
}
$evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
Write-Output ("RESULT: {0}" -f $evidence.result)
Write-Output ("EVIDENCE: {0}" -f $EvidencePath)
if (-not $allOk) { exit 1 }
exit 0
