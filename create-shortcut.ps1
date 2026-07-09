$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\NodeSpace.lnk")
$Shortcut.TargetPath = "D:\cc\workspace\nodespace\start.bat"
$Shortcut.WorkingDirectory = "D:\cc\workspace\nodespace"
$Shortcut.Save()
Write-Host "Shortcut created"
