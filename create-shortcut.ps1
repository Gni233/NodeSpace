$desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
$launcher = Join-Path $PSScriptRoot 'start.bat'
$shortcutPath = Join-Path $desktop 'NodeSpace.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = 'NodeSpace desktop app'
$shortcut.WindowStyle = 7
$icon = Join-Path $PSScriptRoot 'public\icon.ico'
if (Test-Path -LiteralPath $icon -PathType Leaf) { $shortcut.IconLocation = "$icon,0" }
$shortcut.Save()
Write-Host "NodeSpace shortcut: $shortcutPath"
