# QingYue release helper: prepare offline zip + SHA-256 + APK/AAB summary.
# Usage (PowerShell, repo root):
#   .\scripts\prepare-release.ps1 -Version "1.3.0"
# Also requires: JDK21 build of APK/AAB already done (assembleRelease/bundleRelease),
# and npm run build output in dist/.
# Does NOT create the git tag; that is done manually after real-device acceptance.

param(
    [string]$Version = "1.3.0"
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'
$out  = Join-Path $root 'release-artifacts'
$apk  = Join-Path $root 'android\app\build\outputs\apk\release\app-release.apk'
$aab  = Join-Path $root 'android\app\build\outputs\bundle\release\app-release.aab'

if (-not (Test-Path "$dist\index.html")) {
    throw 'dist/index.html missing - run npm run build first'
}
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path $out | Out-Null

$zipName = "qingyue-offline-$Version.zip"
$zipPath = Join-Path $out $zipName
Compress-Archive -Path (Join-Path $dist '*') -DestinationPath $zipPath -Force
$zipSha = (Get-FileHash $zipPath -Algorithm SHA256).Hash

$L = New-Object System.Collections.ArrayList
[void]$L.Add("=== QingYue $Version release assets ===")
[void]$L.Add("offline zip:  $zipName")
[void]$L.Add("  SHA-256: $zipSha")
if (Test-Path $apk) {
    $apkHash = (Get-FileHash $apk -Algorithm SHA256).Hash
    $apkMb = [math]::Round((Get-Item $apk).Length / 1MB, 2)
    [void]$L.Add("APK: app-release.apk ($apkMb MB)")
    [void]$L.Add("  SHA-256: $apkHash")
}
if (Test-Path $aab) {
    $aabHash = (Get-FileHash $aab -Algorithm SHA256).Hash
    $aabMb = [math]::Round((Get-Item $aab).Length / 1MB, 2)
    [void]$L.Add("AAB: app-release.aab ($aabMb MB)")
    [void]$L.Add("  SHA-256: $aabHash")
}
[void]$L.Add("")
[void]$L.Add("Release commands (after real-device acceptance):")
[void]$L.Add("  gh release create v$Version -t 'v$Version' -F release-notes-$Version.md")
[void]$L.Add("  gh release upload v$Version `"$zipPath`" `"$apk`" `"$aab`" --clobber")

$txt = $L -join "`r`n"
Write-Host $txt
$checklist = Join-Path $out "release-checklist-$Version.txt"
$txt | Set-Content -Path $checklist -Encoding utf8
Write-Host ""
Write-Host "Assets written to: $out"
