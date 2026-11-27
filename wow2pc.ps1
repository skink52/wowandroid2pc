<#
  wow2pc - stream WoW Forever (app.wowforever) from an Android phone to this PC
  with PC keyboard/mouse control. Uses scrcpy (portable, no admin needed).

  wow2pc.cmd                 launch now (starts the app on the phone if needed)
  wow2pc.cmd -Watch          background: auto-launch when phone is plugged in AND the app is in focus
  wow2pc.cmd -Install        run -Watch automatically at Windows logon (per-user Startup folder)
  wow2pc.cmd -Uninstall      remove the logon entry
  Options: -Wifi 192.168.1.20:5555  -MouseMode sdk|uhid  -KeyboardMode uhid|sdk
           -Fullscreen  -ScreenOff  -MaxFps 60  -BitRate 16M  -MaxSize 0
#>
param(
  [switch]$Watch, [switch]$Install, [switch]$Uninstall,
  [string]$Wifi = '',
  [ValidateSet('sdk','uhid')][string]$MouseMode = 'sdk',
  [ValidateSet('uhid','sdk')][string]$KeyboardMode = 'uhid',
  [switch]$Fullscreen, [switch]$ScreenOff,
  [int]$MaxFps = 60, [string]$BitRate = '16M', [int]$MaxSize = 0
)

$ErrorActionPreference = 'Stop'
$Pkg     = 'app.wowforever'
$Home2   = Join-Path $env:LOCALAPPDATA 'wow2pc'
$ScrDir  = Join-Path $Home2 'scrcpy'
$LogFile = Join-Path $Home2 'wow2pc.log'
New-Item -ItemType Directory -Force -Path $Home2 | Out-Null

function Log($m) { $l = "$(Get-Date -Format s) $m"; Write-Host $l; Add-Content -Path $LogFile -Value $l }

function Get-Scrcpy {
  $exe = Get-ChildItem -Path $ScrDir -Recurse -Filter scrcpy.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($exe) { return $exe.Directory.FullName }
  Log 'Downloading scrcpy (portable)...'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $rel   = Invoke-RestMethod -UseBasicParsing 'https://api.github.com/repos/Genymobile/scrcpy/releases/latest'
  $asset = $rel.assets | Where-Object { $_.name -like 'scrcpy-win64-v*.zip' } | Select-Object -First 1
  if (-not $asset) { throw 'Could not find scrcpy win64 release. Download it manually into ' + $ScrDir }
  $zip = Join-Path $Home2 $asset.name
  Invoke-WebRequest -UseBasicParsing $asset.browser_download_url -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $ScrDir -Force
  Remove-Item $zip
  return (Get-ChildItem -Path $ScrDir -Recurse -Filter scrcpy.exe | Select-Object -First 1).Directory.FullName
}

$Bin  = Get-Scrcpy
$Adb  = Join-Path $Bin 'adb.exe'
$Scr  = Join-Path $Bin 'scrcpy.exe'

function Get-Device {
  if ($Wifi) { & $Adb connect $Wifi 2>$null | Out-Null }
  $lines = & $Adb devices 2>$null | Select-Object -Skip 1 | Where-Object { $_ -match "`tdevice$" }
  if ($Wifi) { $lines = $lines | Where-Object { $_ -like "$Wifi*" } }
  else       { $lines = $lines | Where-Object { $_ -notmatch ':' } }   # prefer USB
  if ($lines) { return (@($lines)[0] -split "`t")[0] }
  # report unauthorized devices once so the user knows to accept the prompt on the phone
  if (& $Adb devices 2>$null | Select-String 'unauthorized') { Log 'Phone found but unauthorized: accept the USB debugging prompt on the phone.' }
  return $null
}

function Test-AppFocused($serial) {
  $out = & $Adb -s $serial shell "dumpsys activity activities | grep -E 'topResumedActivity|mResumedActivity'" 2>$null
  return ($out -match [regex]::Escape("$Pkg/"))
}

function Start-Stream($serial, [switch]$StartApp) {
  $a = @('-s', $serial, '--window-title', '"WoW Forever"',
         "--keyboard=$KeyboardMode", "--mouse=$MouseMode",
         "--max-fps=$MaxFps", "--video-bit-rate=$BitRate",
         '--video-codec=h265', '--stay-awake', '--shortcut-mod=lctrl+lalt')
  # sdk mouse: forward right/middle/side buttons to the game instead of scrcpy's default (right click = Back)
  if ($MouseMode -eq 'sdk') { $a += '--mouse-bind=++++:++++' }
  if ($MaxSize -gt 0) { $a += "--max-size=$MaxSize" }
  if ($Fullscreen)    { $a += '--fullscreen' }
  if ($ScreenOff)     { $a += '--turn-screen-off' }
  if ($StartApp)      { $a += "--start-app=$Pkg" }
  Log "Starting scrcpy on $serial ($($a -join ' '))"
  $p = Start-Process -FilePath $Scr -ArgumentList $a -WorkingDirectory $Bin -PassThru -NoNewWindow
  $p.WaitForExit()
  Log "scrcpy exited ($($p.ExitCode))"
}

if ($Install) {
  $dst = Join-Path $Home2 'wow2pc.ps1'
  if ($PSCommandPath -ne $dst) { Copy-Item $PSCommandPath $dst -Force }
  $extra = ''
  foreach ($k in $PSBoundParameters.Keys) {
    if ($k -in 'Install','Watch') { continue }
    $v = $PSBoundParameters[$k]
    if ($v -is [switch]) { if ($v) { $extra += " -$k" } } else { $extra += " -$k `"$v`"" }
  }
  $lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'wow2pc.lnk'
  $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
  $s.TargetPath = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
  $s.Arguments  = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$dst`" -Watch$extra"
  $s.Save()
  Start-Process -FilePath $s.TargetPath -ArgumentList $s.Arguments -WindowStyle Hidden
  Log "Installed: $lnk (watcher started; runs at every logon)"
  exit
}

if ($Uninstall) {
  Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) 'wow2pc.lnk') -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like '*wow2pc.ps1*-Watch*' -and $_.ProcessId -ne $PID } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Log 'Uninstalled.'
  exit
}

if ($Watch) {
  # single instance
  $mtx = New-Object Threading.Mutex($false, 'Local\wow2pc-watch')
  if (-not $mtx.WaitOne(0)) { exit }
  Log "Watching for phone + $Pkg in focus..."
  $armed = $true   # re-arms after the app loses focus or phone disconnects, so closing the window doesn't instantly reopen it
  while ($true) {
    $dev = Get-Device
    if ($dev -and (Test-AppFocused $dev)) {
      if ($armed) { Start-Stream $dev; $armed = $false }
    } else { $armed = $true }
    Start-Sleep -Seconds 3
  }
}

# one-shot launch
$dev = Get-Device
if (-not $dev) {
  Log 'No phone found. Plug in via USB with USB debugging on (or use -Wifi ip:port). Waiting...'
  while (-not ($dev = Get-Device)) { Start-Sleep -Seconds 2 }
}
Start-Stream $dev -StartApp:(-not (Test-AppFocused $dev))
