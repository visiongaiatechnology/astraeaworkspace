# Release Beta 0.1 — cold start measurement (Lead-owned release evidence).
#
# Measures time from process start to the first visible main window title for the packaged EXE.
# This is a real measurement on THIS machine, not a synthetic DOM benchmark; the result is only
# comparable across runs on the same hardware/profile setup. Each round uses an isolated profile
# so the measurement does not read or write the user's workspace.
param(
  [string]$Executable = "",
  [int]$Rounds = 3,
  [int]$TimeoutSeconds = 60,
  [string]$EvidencePath = ""
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $Executable) { $Executable = Join-Path $repoRoot 'target\release\vgt-desktop.exe' }
if (-not (Test-Path -LiteralPath $Executable)) { Write-Error "EXE not found: $Executable"; exit 2 }
if (-not $EvidencePath) { $EvidencePath = Join-Path ([System.IO.Path]::GetTempPath()) ("astraea-coldstart-" + [guid]::NewGuid().ToString('N') + '.json') }

$results = @()
for ($round = 1; $round -le $Rounds; $round += 1) {
  $profile = Join-Path ([System.IO.Path]::GetTempPath()) ("astraea-coldstart-profile-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $profile | Out-Null
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Executable
  $psi.UseShellExecute = $false
  $psi.EnvironmentVariables['APPDATA'] = $profile
  $psi.EnvironmentVariables['LOCALAPPDATA'] = $profile
  $psi.EnvironmentVariables['USERPROFILE'] = $profile
  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  $process = [System.Diagnostics.Process]::Start($psi)
  $firstWindowMs = $null
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 100
    $process.Refresh()
    if ($process.HasExited) { break }
    if ($process.MainWindowHandle -ne 0) {
      $watch.Stop()
      $firstWindowMs = [int]$watch.ElapsedMilliseconds
      break
    }
  }
  $watch.Stop()
  if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 800
  Remove-Item -LiteralPath $profile -Recurse -Force -ErrorAction SilentlyContinue
  $results += [ordered]@{
    round = $round
    firstWindowMs = $firstWindowMs
    alive = ($firstWindowMs -ne $null)
  }
}

$measured = @($results | Where-Object { $_.firstWindowMs -ne $null } | ForEach-Object { $_.firstWindowMs })
$summary = if ($measured.Count -gt 0) {
  [ordered]@{
    samplesMs = $measured
    minMs = ($measured | Measure-Object -Minimum).Minimum
    maxMs = ($measured | Measure-Object -Maximum).Maximum
    averageMs = [int](($measured | Measure-Object -Average).Average)
  }
} else { [ordered]@{ samplesMs = @(); minMs = $null; maxMs = $null; averageMs = $null } }

$evidence = [ordered]@{
  schema = 'astraea.release.cold-start/1'
  createdAt = (Get-Date).ToString('o')
  executable = (Resolve-Path -LiteralPath $Executable).Path
  executableSha256 = (Get-FileHash -LiteralPath $Executable -Algorithm SHA256).Hash
  rounds = $results
  summary = $summary
  note = 'First visible main window title after process start, isolated throwaway profiles, same machine; comparable only to runs on this host.'
}
$evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
Write-Output ("COLDSTART: {0}" -f ($(if ($measured.Count -gt 0) { "$($summary.averageMs) ms avg (min $($summary.minMs), max $($summary.maxMs)) over $($measured.Count) run(s)" } else { 'no window detected' })))
Write-Output ("EVIDENCE: {0}" -f $EvidencePath)
if ($measured.Count -eq 0) { exit 1 }
exit 0
