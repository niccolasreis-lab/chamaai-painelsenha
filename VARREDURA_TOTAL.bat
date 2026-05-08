@echo off
setlocal
title VARREDURA TOTAL - LIMPEZA DE VESTIGIOS

echo ======================================================
echo       CHAMAAI - LIMPEZA COMPLETA DE VESTIGIOS
echo ======================================================
echo.
echo [!] ATENCAO: Este script apagara TUDO do sistema:
echo 1. Programa instalado
echo 2. Banco de dados e Midias (C:\ChamaAi)
echo 3. Caches e Configuracoes ocultas
echo 4. Atalhos na Area de Trabalho
echo.
echo Deseja continuar com a limpeza total? (S/N)
set /p "confirm="
if /i not "%confirm%"=="S" exit /b

echo.
echo [1/6] MODO BRUTAL: Encerrando todos os processos relacionados...
:: Camada 1: Taskkill tradicional
taskkill /F /IM "ChamaA*.exe" /T 2>nul
taskkill /F /IM "chamaai*.exe" /T 2>nul
taskkill /F /IM "electron.exe" /T 2>nul
taskkill /F /IM "node.exe" /T 2>nul

:: Camada 2: PowerShell (Busca profunda por caminho e comando)
powershell -Command "Get-Process | Where-Object { $_.Path -like '*chamaai*' -or $_.Name -like '*ChamaA*' -or $_.CommandLine -like '*chamaai*' } | Stop-Process -Force -ErrorAction SilentlyContinue"

:: Camada 3: WMIC (Baixo nivel)
wmic process where "name like 'ChamaA%%'" delete >nul 2>&1
wmic process where "commandline like '%%chamaai%%'" delete >nul 2>&1

echo Processos aniquilados.
timeout /t 3 /nobreak >nul

echo.
echo [2/6] Removendo pasta de dados C:\ChamaAi...
if exist "C:\ChamaAi" (
    rd /s /q "C:\ChamaAi"
    echo Pasta C:\ChamaAi removida.
)

echo.
echo [3/6] Removendo configuracoes em AppData (Roaming)...
if exist "%APPDATA%\chamaai-novo" (
    rd /s /q "%APPDATA%\chamaai-novo"
    echo AppData Roaming limpo.
)

echo.
echo [4/6] Removendo programa instalado (Local)...
if exist "%LOCALAPPDATA%\Programs\chamaai-novo" (
    rd /s /q "%LOCALAPPDATA%\Programs\chamaai-novo"
    echo AppData Local (Programa) removido.
)

echo.
echo [5/6] Removendo atalhos...
if exist "%PUBLIC%\Desktop\ChamaAí.lnk" del /f /q "%PUBLIC%\Desktop\ChamaAí.lnk"
if exist "%USERPROFILE%\Desktop\ChamaAí.lnk" del /f /q "%USERPROFILE%\Desktop\ChamaAí.lnk"
if exist "%USERPROFILE%\Desktop\ChamaAí*.lnk" del /f /q "%USERPROFILE%\Desktop\ChamaAí*.lnk"
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\ChamaAí.lnk" del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\ChamaAí.lnk"
echo Atalhos removidos.

echo.
echo [6/6] Limpando registros temporarios...
if exist "%TEMP%\chamaai-novo" rd /s /q "%TEMP%\chamaai-novo"
if exist "%TEMP%\ChamaAí*" rd /s /q "%TEMP%\ChamaAí*"

echo.
echo ======================================================
echo           VARREDURA CONCLUIDA COM SUCESSO!
echo ======================================================
echo.
echo O computador esta limpo. Voce pode prosseguir com a 
echo instalacao da versao 1.0.31 do zero.
echo.
pause
