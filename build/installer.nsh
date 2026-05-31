!macro preInit
  ; Removemos o registro da instalação antiga antes que o instalador o procure.
  ; Isso faz com que o instalador pule a desinstalação silenciosa (que falha com erro 2)
  ; e faça diretamente uma instalação por sobreposição limpa e sem erros.
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\bc98e1a1-5f57-5e80-b6b4-3a8eb69e2f35"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\bc98e1a1-5f57-5e80-b6b4-3a8eb69e2f35"
!macroend

!macro customInstall
  ; Aguarda mais 1 segundo para garantir liberação dos arquivos
  Sleep 1000
!macroend