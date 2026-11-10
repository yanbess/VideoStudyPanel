# Builds the ZIP to upload to the Chrome Web Store:
#   powershell -ExecutionPolicy Bypass -File pack.ps1
# The result is dist\video-study-panel-<version>.zip, with only the files
# the extension needs and manifest.json at the root of the archive.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$files = @(
  'manifest.json',
  'content.js',
  'styles.css',
  'popup.html',
  'popup.js',
  'popup.css',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png'
)

foreach ($f in $files) {
  if (-not (Test-Path $f)) { throw "Missing file: $f" }
}

$manifest = Get-Content manifest.json -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifest.version
$zipPath = Join-Path $PSScriptRoot "dist\video-study-panel-$version.zip"

New-Item -ItemType Directory -Force (Join-Path $PSScriptRoot 'dist') | Out-Null
if (Test-Path $zipPath) { Remove-Item $zipPath -Confirm:$false }

# Built with .NET directly: Compress-Archive in Windows PowerShell 5.1 writes
# backslashes into entry names (icons\icon16.png), which the store rejects.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
  foreach ($f in $files) {
    $full = Join-Path $PSScriptRoot $f
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $full, $f, 'Optimal') | Out-Null
  }
} finally {
  $zip.Dispose()
}

$size = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
Write-Output "Built $zipPath ($size KB), version $version"
