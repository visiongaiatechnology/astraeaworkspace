# Release evidence: only one Astraea Workspace instance may write the workspace store.
#
# Two concurrent instances would autosave the same files and a stale window could silently overwrite
# newer work. This smoke starts the real EXE twice: the first instance owns the workspace, the second
# is started with ASTRAEA_SINGLE_INSTANCE_PROBE=1 (headless test hook) and must exit with code 42
# instead of becoming a second writer. The first instance must stay alive and windowed.
param(
  [string]$Executable = "",
  [int]$FirstWindowTimeoutSeconds = 30,
  [int]$SecondExitTimeoutSeconds = 15,
  [string]$EvidencePath = ""
)
$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $Executable) { $Executable = Join-Path $repoRoot 'target\release\vgt-desktop.exe' }
if (-not (Test-Path -LiteralPath $Executable)) { throw "EXE not found: $Executable" }
if (-not $EvidencePath) { $EvidencePath = Join-Path ([System.IO.Path]::GetTempPath()) ("astraea-single-instance-" + [guid]::NewGuid().ToString('N') + '.json') }
$profileRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("astraea-single-instance-profile-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $profileRoot | Out-Null

$result = [ordered]@{
  schema = 'astraea.release.single-instance/1'
  createdAt = (Get-Date).ToString('o')
  executable = (Resolve-Path -LiteralPath $Executable).Path
  executableSha256 = (Get-FileHash -LiteralPath $Executable -Algorithm SHA256).Hash
  steps = [ordered]@{}
}
$first = $null
$second = $null
try {
  $firstInfo = New-Object System.Diagnostics.ProcessStartInfo
  $firstInfo.FileName = $Executable
  $firstInfo.UseShellExecute = $false
  $firstInfo.EnvironmentVariables['APPDATA'] = $profileRoot
  $firstInfo.EnvironmentVariables['LOCALAPPDATA'] = $profileRoot
  $firstInfo.EnvironmentVariables['USERPROFILE'] = $profileRoot
  $first = [System.Diagnostics.Process]::Start($firstInfo)
  $deadline = (Get-Date).AddSeconds($FirstWindowTimeoutSeconds)
  $firstWindow = $false
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 150
    $first.Refresh()
    if ($first.HasExited) { break }
    if ($first.MainWindowHandle -ne 0) { $firstWindow = $true; break }
  }
  $result.steps.firstInstance = [ordered]@{ alive = -not $first.HasExited; window = $firstWindow; title = $first.MainWindowTitle }
  if (-not $firstWindow) { throw 'first instance did not produce a window' }

  $secondInfo = New-Object System.Diagnostics.ProcessStartInfo
  $secondInfo.FileName = $Executable
  $secondInfo.UseShellExecute = $false
  $secondInfo.EnvironmentVariables['APPDATA'] = $profileRoot
  $secondInfo.EnvironmentVariables['LOCALAPPDATA'] = $profileRoot
  $secondInfo.EnvironmentVariables['USERPROFILE'] = $profileRoot
  $secondInfo.EnvironmentVariables['ASTRAEA_SINGLE_INSTANCE_PROBE'] = '1'
  $second = [System.Diagnostics.Process]::Start($secondInfo)
  $exited = $second.WaitForExit($SecondExitTimeoutSeconds * 1000)
  $secondExitCode = if ($exited) { $second.ExitCode } else { $null }
  $result.steps.secondInstance = [ordered]@{ exited = $exited; exitCode = $secondExitCode; expectedExitCode = 42 }
  if (-not $exited) { throw 'second instance did not exit within the timeout (guard not effective)' }
  if ($secondExitCode -ne 42) { throw "second instance exit code $secondExitCode is not the guard code 42" }

  $first.Refresh()
  $result.steps.firstStillRunning = [ordered]@{ alive = -not $first.HasExited; window = ($first.MainWindowHandle -ne 0) }
  if ($first.HasExited) { throw 'first instance exited unexpectedly after the second launch' }
  $result.passed = $true
} catch {
  $result.error = $_.Exception.Message
  $result.passed = $false
} finally {
  foreach ($process in @($second, $first)) {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  }
  Start-Sleep -Milliseconds 500
  Remove-Item -LiteralPath $profileRoot -Recurse -Force -ErrorAction SilentlyContinue
}
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
if ($result.passed) {
  Write-Output 'SINGLE_INSTANCE: PASS - second launch exited with guard code 42, first instance stayed alive'
  Write-Output ("EVIDENCE: {0}" -f $EvidencePath)
  exit 0
}
Write-Output ("SINGLE_INSTANCE: FAIL - {0}" -f $result.error)
Write-Output ("EVIDENCE: {0}" -f $EvidencePath)
exit 1
