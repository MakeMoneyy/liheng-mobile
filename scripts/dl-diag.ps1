param(
  [string]$RunId = "38509009271",
  [string]$Artifact = "diag-shots",
  [string]$OutDir = "$env:TEMP\diag3"
)

# 需要预先设置 $env:GH_TOKEN；不把任何凭据写进仓库。
if (-not $env:GH_TOKEN) { throw "请先设置 `$env:GH_TOKEN" }
if (-not $env:HTTPS_PROXY) { $env:HTTPS_PROXY = "http://127.0.0.1:7897" }
$gh = "C:\Program Files\GitHub CLI\gh.exe"

if (Test-Path -LiteralPath $OutDir) { Remove-Item -LiteralPath $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir | Out-Null

& $gh run download $RunId --repo MakeMoneyy/liheng-mobile --name $Artifact --dir $OutDir
Get-ChildItem -Recurse $OutDir | Select-Object FullName, Length
