!macro customInit
  ; === KILL PROCESSES VIA POWERSHELL (More reliable for Unicode/Wildcards) ===
  ; Encerra qualquer processo que tenha "chamaai" ou "ChamaA" no nome ou no caminho
  nsExec::ExecToLog 'powershell -Command "Get-Process | Where-Object { $_.Path -like ''*chamaai*'' -or $_.Name -like ''*ChamaA*'' -or $_.CommandLine -like ''*chamaai*'' } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  
  ; Fallback com taskkill para garantir
  nsExec::ExecToLog 'taskkill /f /im "ChamaA*.exe" /t'
  nsExec::ExecToLog 'taskkill /f /im "chamaai-novo.exe" /t'
  
  ; Espera o Windows liberar os locks
  Sleep 3000
!macroend

!macro customUnInit
  nsExec::ExecToLog 'powershell -Command "Get-Process | Where-Object { $_.Name -like ''*ChamaA*'' -or $_.Name -like ''*chamaai*'' } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  Sleep 2000
!macroend
