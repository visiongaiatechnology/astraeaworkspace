# Release evidence: checks whether the packaged EXE is bit-identical across two builds from the
# same source tree. This is NOT a proof of reproducible-build provenance (the Inno installer embeds
# timestamps), but it is a concrete, dated measurement for the VGT-055 provenance finding.
param(
  [int]$Rounds = 2,
  [string]$EvidencePath = ""
)
$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $EvidencePath) { $EvidencePath = Join-Path ([System.IO.Path]::GetTempPath()) ("astraea-build-determinism-" + [guid]::NewGuid().ToString('N') + '.json') }
$exe = Join-Path $repoRoot 'target\release\vgt-desktop.exe'
$rows = @()
Push-Location (Join-Path $repoRoot 'ui')
try { npm run build:open-core 2>&1 | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'ui build failed' } } finally { Pop-Location }
for ($round = 1; $round -le $Rounds; $round += 1) {
  Push-Location $repoRoot
  try {
    cargo tauri build --no-bundle 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "tauri build failed in round $round" }
  } finally { Pop-Location }
  $hash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash
  $rows += [ordered]@{ round = $round; sha256 = $hash; sizeBytes = (Get-Item -LiteralPath $exe).Length }
}
$distinct = @($rows | ForEach-Object { $_.sha256 } | Sort-Object -Unique)
$evidence = [ordered]@{
  schema = 'astraea.release.build-determinism/1'
  createdAt = (Get-Date).ToString('o')
  executable = $exe
  rounds = $rows
  distinctHashes = $distinct
  deterministicOnThisMachine = ($distinct.Count -eq 1)
  note = 'Rebuilds of the same source tree on this machine; not a CI provenance attestation. Installer builds embed timestamps and are not expected to be bit-identical.'
}
$evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
if ($distinct.Count -eq 1) { Write-Output "DETERMINISM: PASS ($($distinct[0]))"; Write-Output "EVIDENCE: $EvidencePath"; exit 0 }
Write-Output "DETERMINISM: FAIL (hashes differ: $($distinct -join ', '))"; Write-Output "EVIDENCE: $EvidencePath"; exit 1
