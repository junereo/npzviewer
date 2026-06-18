$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:PYTHON_BIN = "C:\Users\tjmaxx\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$env:PORT = "4174"
try {
  & "C:\Users\tjmaxx\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "node_modules\tsx\dist\cli.cjs" watch "server\index.ts" *> "$PSScriptRoot\.api.run.log"
} catch {
  $_ | Out-File -Encoding utf8 "$PSScriptRoot\.api.run.err.log"
  throw
}
