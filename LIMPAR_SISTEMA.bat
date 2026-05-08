@echo off
setlocal
title LIMPEZA PROFUNDA - CHAMAAI

echo ======================================================
echo           CHAMAAI - LIMPEZA DO SISTEMA
echo ======================================================
echo.
echo ATENCAO: Este script vai encerrar o sistema e limpar 
echo todos os arquivos temporarios, caches e builds.
echo.
pause

echo.
echo [1/5] Encerrando processos...
powershell -Command "Get-Process | Where-Object { $_.Name -like '*ChamaA*' -or $_.Name -like '*electron*' -or $_.Name -like '*node*' } | Stop-Process -Force -ErrorAction SilentlyContinue"
taskkill /F /IM "ChamaA*.exe" /T 2>nul
taskkill /F /IM "node.exe" /T 2>nul
timeout /t 2 /nobreak >nul

echo.
echo [2/5] Limpando pastas de Build e Release...
if exist "dist" rd /s /q "dist"
if exist "dist-electron" rd /s /q "dist-electron"
if exist "release" rd /s /q "release"
if exist "out" rd /s /q "out"
echo Pastas dist/release removidas.

echo.
echo [3/5] Limpando Cache do Electron (AppData)...
if exist "%APPDATA%\chamaai-novo" (
    echo Removendo cache em %APPDATA%\chamaai-novo...
    rd /s /q "%APPDATA%\chamaai-novo"
)
echo Cache do AppData limpo.

echo.
echo [4/5] Limpando arquivos temporarios do sistema...
del /q /f /s "%TEMP%\*ChamaA*" 2>nul
echo Temporarios limpos.

echo.
echo [5/5] Sugestao Final...
echo.
echo ======================================================
echo              LIMPEZA CONCLUIDA COM SUCESSO!
echo ======================================================
echo.
echo IMPORTANTE: No seu navegador (Chrome/Safari), faca:
echo 1. Aperte CTRL + F5 para limpar o cache do PWA.
echo 2. Se possivel, limpe os "Dados do Site" nas configuracoes.
echo.
echo Agora voce pode rodar 'npm run dev' ou 'npm run build' 
echo em um ambiente totalmente limpo.
echo.
pause
