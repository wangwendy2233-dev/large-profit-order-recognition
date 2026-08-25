$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $root "logs"
$logFile = Join-Path $logDir "hourly.log"
$lockFile = Join-Path $root ".ocr.lock"
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = "node" }

if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

function Write-Log([string]$message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message
  $line | Out-File -FilePath $logFile -Append -Encoding utf8
  Write-Output $line
}

if (Test-Path $lockFile) {
  $lockAgeHours = ((Get-Date) - (Get-Item $lockFile).LastWriteTime).TotalHours
  if ($lockAgeHours -lt 2) {
    Write-Log "skip: another OCR pass is running (lock age ${lockAgeHours}h)"
    exit 0
  }
  Write-Log "stale lock removed"
  Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
}

[System.IO.File]::WriteAllText($lockFile, ("{0} pid={1}" -f (Get-Date).ToString("o"), $PID))

try {
  Write-Log "hourly OCR start"
  Set-Location $root
  & $node "run-hourly.js" *>> $logFile
  $ocrExit = $LASTEXITCODE
  Write-Log "run-hourly exit=$ocrExit"
  Write-Log "hourly OCR done"
  if ($ocrExit -ne 0) { exit $ocrExit }
} finally {
  Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
}
