param(
  [ValidateSet('lite')]
  [string]$Track = 'lite'
)

$ErrorActionPreference = 'Stop'

$Repo = 'hang-in/tunaFlow'
$ApiUrl = "https://api.github.com/repos/$Repo/releases?per_page=10"
$Headers = @{
  'User-Agent' = 'tunaFlow-install'
  'Accept' = 'application/vnd.github+json'
}

Write-Host "Fetching latest tunaFlow release metadata..."
$releases = Invoke-RestMethod -Uri $ApiUrl -Headers $Headers

$selectedRelease = $null
$selectedAsset = $null

foreach ($release in $releases) {
  foreach ($asset in $release.assets) {
    if ($asset.name -match 'x64' -and $asset.name -match 'setup' -and $asset.name -match '\.exe$') {
      $selectedRelease = $release
      $selectedAsset = $asset
      break
    }
  }
  if ($selectedAsset) { break }
}

if (-not $selectedAsset) {
  throw "Windows x64 NSIS installer not found in the latest releases. Open https://github.com/$Repo/releases and download the latest Windows asset manually."
}

$tmpInstaller = Join-Path $env:TEMP ("tunaflow-" + [System.IO.Path]::GetRandomFileName() + ".exe")

Write-Host "Downloading $($selectedAsset.name) from $($selectedRelease.tag_name)..."
Invoke-WebRequest -Uri $selectedAsset.browser_download_url -OutFile $tmpInstaller

try {
  Write-Host "Launching installer..."
  Start-Process -FilePath $tmpInstaller -Wait
}
finally {
  Remove-Item $tmpInstaller -Force -ErrorAction SilentlyContinue
}

Write-Host "tunaFlow installation finished. Use the Start Menu shortcut or rerun the app from its installed location."
