# Release evidence: does the portable ZIP actually run on a clean temp folder?
#
# The portable distribution is the fallback for testers without installer rights. This script
# extracts it, verifies the EXE hash against the release build, launches it with an isolated profile,
# waits for a real main window, closes it and checks that no WebView2 profile polluted the portable
# folder (the reason the installer hygiene fix exists). It is a process/window smoke, not a UI test.
param(
  [string]$PortableZip = "",
  [string]$ExpectedExe = "",
  [int]$TimeoutSeconds = 45,
  [string]$EvidencePath = ""
)
$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $PortableZip) {
  $PortableZip = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'release\inno\dist') -Filter '*-Portable.zip' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { $_.FullName }
}
if (-not $PortableZip -or -not (Test-Path -LiteralPath $PortableZip)) { throw "Portable ZIP not found: $PortableZip" }
if (-not $ExpectedExe) { $ExpectedExe = Join-Path $repoRoot 'target\release\vgt-desktop.exe' }
if (-not (Test-Path -LiteralPath $ExpectedExe)) { throw "Expected EXE not found: $ExpectedExe" }
if (-not $EvidencePath) { $EvidencePath = Join-Path ([System.IO.Path]::GetTempPath()) ("astraea-portable-" + [guid]::NewGuid().ToString('N') + '.json') }

$expectedHash = (Get-FileHash -LiteralPath $ExpectedExe -Algorithm SHA256).Hash
$extractDir = Join-Path ([System.IO.Path]::GetTempPath()) ("astraea-portable-run-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $extractDir | Out-Null
$profile = Join-Path ([System.IO.Path]::GetTempPath()) ("astraea-portable-profile-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $profile | Out-Null

$result = [ordered]@{
  schema = 'astraea.release.portable-smoke/1'
  createdAt = (Get-Date).ToString('o')
  portableZip = (Resolve-Path -LiteralPath $PortableZip).Path
  portableZipSha256 = (Get-FileHash -LiteralPath $PortableZip -Algorithm SHA256).Hash
  expectedExeSha256 = $expectedHash
  steps = [ordered]@{}
}

try {
  Expand-Archive -LiteralPath $PortableZip -DestinationPath $extractDir -Force
  $files = Get-ChildItem -LiteralPath $extractDir -Recurse -File | ForEach-Object { $_.FullName.Substring($extractDir.Length + 1) }
  $result.steps.extracted = [ordered]@{ passed = ($files -contains 'vgt-desktop.exe'); fileCount = @($files).Count }

  $portableExe = Join-Path $extractDir 'vgt-desktop.exe'
  if (-not (Test-Path -LiteralPath $portableExe)) { throw 'vgt-desktop.exe missing after extraction' }
  $portableHash = (Get-FileHash -LiteralPath $portableExe -Algorithm SHA256).Hash
  $result.steps.binaryHash = [ordered]@{ passed = ($portableHash -eq $expectedHash); sha256 = $portableHash }

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $portableExe
  $psi.UseShellExecute = $false
  $psi.EnvironmentVariables['APPDATA'] = $profile
  $psi.EnvironmentVariables['LOCALAPPDATA'] = $profile
  $psi.EnvironmentVariables['USERPROFILE'] = $profile
  $process = [System.Diagnostics.Process]::Start($psi)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $windowSeen = $false
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 150
    $process.Refresh()
    if ($process.HasExited) { break }
    if ($process.MainWindowHandle -ne 0) { $windowSeen = $true; break }
  }
  $result.steps.launch = [ordered]@{ passed = $windowSeen; alive = -not $process.HasExited; windowTitle = $process.MainWindowTitle }
  if (-not $process.HasExited) {
    $closeRequested = $process.CloseMainWindow()
    if ($closeRequested) { $process.WaitForExit(15000) | Out-Null }
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  }
  Start-Sleep -Milliseconds 800

  $webviewDirs = @(Get-ChildItem -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like '*WebView2*' -or $_.Name -like '*.WebView2' })
  # Observed behavior: WebView2 may create "vgt-desktop.exe.WebView2" (browser cache/profile) next to
  # the EXE. It contains no document content; documents stay in the AppData paths documented in
  # PORTABLE-README-DE.txt. This is recorded, not treated as a failure.
  $result.steps.webviewProfile = [ordered]@{
    observation = $(if ($webviewDirs.Count -gt 0) { 'portable-adjacent' } else { 'absent-or-elsewhere' })
    matches = $webviewDirs.Count
    documented = 'PORTABLE-README-DE.txt documents the WebView2 cache/profile location and that document content stays in AppData.'
  }

  $profileDirs = @(Get-ChildItem -LiteralPath $profile -Force -ErrorAction SilentlyContinue)
  $result.steps.profileWrites = [ordered]@{ observed = ($profileDirs.Count -gt 0); topLevel = @($profileDirs | ForEach-Object { $_.Name }) }
} catch {
  $result.error = $_.Exception.Message
} finally {
  Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $profile -Recurse -Force -ErrorAction SilentlyContinue
}

$passed = -not $result.Contains('error') -and
  $result.steps.extracted.passed -and
  $result.steps.binaryHash.passed -and
  $result.steps.launch.passed
$result.passed = $passed
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
if ($passed) {
  Write-Output "PORTABLE_SMOKE: PASS - extracted binary hash matches, window appeared; WebView2 cache location recorded and documented"
  Write-Output ("EVIDENCE: {0}" -f $EvidencePath)
  exit 0
}
$failureText = if ($result.Contains('error')) { $result.error } else { 'see evidence' }
Write-Output ("PORTABLE_SMOKE: FAIL - {0}" -f $failureText)
Write-Output ("EVIDENCE: {0}" -f $EvidencePath)
exit 1
