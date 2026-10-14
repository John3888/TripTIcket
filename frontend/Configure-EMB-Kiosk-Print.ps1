param(
  [Parameter(Mandatory=$true)][string]$ProfilePath,
  [Parameter(Mandatory=$true)][string]$PrinterName
)

$ErrorActionPreference = "Stop"

try {
  Get-Printer -Name $PrinterName | Out-Null
  (New-Object -ComObject WScript.Network).SetDefaultPrinter($PrinterName)
} catch {
  Write-Host "Receipt printer not found: $PrinterName"
  Write-Host "Set it as Windows default manually, then reopen this launcher."
}

$defaultProfile = Join-Path $ProfilePath "Default"
New-Item -ItemType Directory -Force -Path $defaultProfile | Out-Null

$preferencesPath = Join-Path $defaultProfile "Preferences"
$preferences = [pscustomobject]@{}

if (Test-Path $preferencesPath) {
  $raw = Get-Content -Raw -Path $preferencesPath
  if ($raw.Trim()) {
    try {
      $preferences = $raw | ConvertFrom-Json
    } catch {
      $preferences = [pscustomobject]@{}
    }
  }
}

if (-not $preferences.printing) {
  $preferences | Add-Member -MemberType NoteProperty -Name printing -Value ([pscustomobject]@{}) -Force
}

$printAppState = [ordered]@{
  version = 2
  isHeaderFooterEnabled = $false
  isCssBackgroundEnabled = $false
  marginsType = 1
  scalingType = 3
  scaling = "100"
  mediaSize = [ordered]@{
    name = "80mm receipt"
    width_microns = 80000
    height_microns = 327600
    custom_display_name = "80mm receipt"
    is_default = $true
  }
}

$stickySettings = [ordered]@{
  appState = ($printAppState | ConvertTo-Json -Compress -Depth 10)
}
$preferences.printing | Add-Member -MemberType NoteProperty -Name print_preview_sticky_settings -Value $stickySettings -Force

$json = $preferences | ConvertTo-Json -Depth 20
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($preferencesPath, $json, $utf8NoBom)
