$ErrorActionPreference = "Continue"
Unregister-ScheduledTask -TaskName "NiuniuShareOrderOCR-Hourly" -Confirm:$false
Write-Output "Removed scheduled task NiuniuShareOrderOCR-Hourly"
