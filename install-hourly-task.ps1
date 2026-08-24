$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskName = "NiuniuShareOrderOCR-Hourly"
$script = Join-Path $root "run-once.ps1"
$ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

$action = New-ScheduledTaskAction `
  -Execute $ps `
  -Argument ("-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"{0}`"" -f $script) `
  -WorkingDirectory $root

$start = (Get-Date).AddMinutes(2)
$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At $start `
  -RepetitionInterval (New-TimeSpan -Hours 1) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -WakeToRun `
  -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -MultipleInstances IgnoreNew `
  -RestartCount 2 `
  -RestartInterval (New-TimeSpan -Minutes 5)

$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Limited

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Every hour: OCR new 大额晒单 records into 图片文字金额提取 / 盈利金额 / 币种. Wakes PC from sleep." | Out-Null

try {
  powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 | Out-Null
  powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 | Out-Null
  powercfg /SETACTIVE SCHEME_CURRENT | Out-Null
} catch {}

Get-ScheduledTask -TaskName $taskName | Format-List TaskName, State, Description
Write-Output "Next run: $($start.ToString('yyyy-MM-dd HH:mm:ss')) then every 1 hour"
Write-Output "Log: $(Join-Path $root 'logs\hourly.log')"
Write-Output "Wake-from-sleep: enabled. Shutdown: this task cannot run until the PC is powered on again."
