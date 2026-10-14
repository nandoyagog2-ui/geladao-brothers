@echo off
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Impressora Geladao.bat" 2>nul
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*impressora-geladao.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
rmdir /S /Q "%LOCALAPPDATA%\ImpressoraGeladao" 2>nul
echo Impressora Geladao removida.
pause
