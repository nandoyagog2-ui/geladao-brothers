@echo off
title Impressora Geladao - instalacao
echo.
echo  Instalando a Impressora Geladao...
echo.
set "DEST=%LOCALAPPDATA%\ImpressoraGeladao"
if not exist "%DEST%" mkdir "%DEST%"
copy /Y "%~dp0impressora-geladao.ps1" "%DEST%\impressora-geladao.ps1" >nul
if errorlevel 1 (
  echo  ERRO: descompacte o arquivo .zip antes de abrir o INSTALAR.
  pause
  exit /b 1
)
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%STARTUP%\Impressora Geladao.bat" echo @echo off
>>"%STARTUP%\Impressora Geladao.bat" echo start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%DEST%\impressora-geladao.ps1"
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%DEST%\impressora-geladao.ps1"
echo  Pronto! A Impressora Geladao esta ligada.
echo  Ela liga sozinha toda vez que o computador iniciar.
echo.
echo  Agora volte no painel, em Impressora, e clique em "Conectar no programa".
echo.
pause
