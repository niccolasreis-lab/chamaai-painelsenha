!macro customInit
  ; Mata processos do ChamaAí de forma robusta com wildcard (evita problemas de encoding com "í")
  nsExec::ExecToStack 'cmd /c taskkill /F /IM "ChamaA*.exe" /T 2>nul'
  Pop $0
  nsExec::ExecToStack 'cmd /c taskkill /F /IM "chamaai*.exe" /T 2>nul'
  Pop $0
  
  ; Cria e executa script de limpeza temporário no diretório de plugins
  InitPluginsDir
  FileOpen $0 "$PLUGINSDIR\cleanup.ps1" w
  FileWrite $0 "gp HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\* -EA 0|?{ $$_.UninstallString -like '*Uninstall ChamaA*.exe*' }|%{$\r$\n"
  FileWrite $0 "  $$u = $$_.UninstallString$\r$\n"
  FileWrite $0 "  $$p = if ($$u -match '$\"([^$\"]+)$\"') { $$Matches[1] } else { $$u.Split(' ')[0] }$\r$\n"
  FileWrite $0 "  if (test-path $$p) {$\r$\n"
  FileWrite $0 "    $$d = Split-Path $$p$\r$\n"
  FileWrite $0 "    $$n = 'Uninstall_ChamaAi.exe'$\r$\n"
  FileWrite $0 "    ren $$p $$n -Force -EA 0$\r$\n"
  FileWrite $0 "    Set-ItemProperty $$_.PSPath 'UninstallString' ($$u -replace [regex]::Escape($$p),(Join-Path $$d $$n)) -Force -EA 0$\r$\n"
  FileWrite $0 "  } else {$\r$\n"
  FileWrite $0 "    rm $$_.PSPath -Force -Recurse -EA 0$\r$\n"
  FileWrite $0 "  }$\r$\n"
  FileWrite $0 "}$\r$\n"
  FileClose $0

  nsExec::ExecToStack 'powershell -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\cleanup.ps1"'
  Pop $0

  ; Espera o Windows liberar as travas de arquivo
  Sleep 2000
!macroend

!macro customUnInit
  ; Mata processos do ChamaAí antes da desinstalação para evitar arquivos travados
  nsExec::ExecToStack 'cmd /c taskkill /F /IM "ChamaA*.exe" /T 2>nul'
  Pop $0
  nsExec::ExecToStack 'cmd /c taskkill /F /IM "chamaai*.exe" /T 2>nul'
  Pop $0
  ; Espera o Windows liberar as travas de arquivo
  Sleep 2000
!macroend