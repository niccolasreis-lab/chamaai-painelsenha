!macro customInit
  ; === PHASE 1: Kill all ChamaAi processes aggressively using native taskkill ===
  ; Since the app is renamed to ChamaAi (no accents), we can use exact, highly efficient native taskkill
  ; without any encoding conflicts, PowerShell compilation warnings, or risk of installer self-killing.
  nsExec::Exec 'taskkill /F /IM "ChamaAi.exe" /T'
  nsExec::Exec 'taskkill /F /IM "chamaai-novo.exe" /T'
  nsExec::Exec 'taskkill /F /IM "chamaai.exe" /T'
  
  ; Free port 3000 (if any zombie process is holding it)
  nsExec::Exec 'cmd.exe /c "for /f \"tokens=5\" %a in (\'netstat -aon ^| findstr :3000\') do taskkill /F /PID %a /T"'
  
  ; === PHASE 2: Wait for processes to fully terminate ===
  Sleep 2000
!macroend

!macro customCheckAppRunning
  ; Let the installer proceed
!macroend

!macro macro_customCheckAppRunning
  ; Fallback alias
!macroend

!macro customUnInit
  ; Kill all processes before uninstall
  nsExec::Exec 'taskkill /F /IM "ChamaAi.exe" /T'
  nsExec::Exec 'taskkill /F /IM "chamaai-novo.exe" /T'
  nsExec::Exec 'taskkill /F /IM "chamaai.exe" /T'
  nsExec::Exec 'cmd.exe /c "for /f \"tokens=5\" %a in (\'netstat -aon ^| findstr :3000\') do taskkill /F /PID %a /T"'
  Sleep 2000
!macroend