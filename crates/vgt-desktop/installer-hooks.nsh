!macro NSIS_HOOK_POSTUNINSTALL
  ; The custom template owns association cleanup and preserves other editions'
  ; handlers. Refresh Explorer after its guarded unregister operations.
  !insertmacro UPDATEFILEASSOC
!macroend
