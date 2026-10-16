$launcher = Join-Path $PSScriptRoot "tools\launchers\启动贝壳云图.ps1"
& $launcher @args
exit $LASTEXITCODE
