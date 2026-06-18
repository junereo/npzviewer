$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
try {
  & "C:\Users\tjmaxx\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "node_modules\vite\bin\vite.js" --host 127.0.0.1 --port 5173 --strictPort *> "$PSScriptRoot\.vite.run.log"
} catch {
  $_ | Out-File -Encoding utf8 "$PSScriptRoot\.vite.run.err.log"
  throw
}
