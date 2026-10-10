$ErrorActionPreference = 'Stop'
$taskNodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($taskNodeCommand) {
    $taskNodePath = $taskNodeCommand.Source
} else {
    $taskNodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $taskNodePath -PathType Leaf)) {
    throw 'Node.js 20+ is required. Install Node.js, then run this launcher again.'
}
Push-Location -LiteralPath $PSScriptRoot
try {
    Write-Host 'Open http://127.0.0.1:4173/ in your browser. Press Ctrl+C to stop.'
    & $taskNodePath (Join-Path $PSScriptRoot 'scripts\serve.mjs')
} finally {
    Pop-Location
}
