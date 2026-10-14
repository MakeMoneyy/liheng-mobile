<#
下载 iOS 模拟器 workflow 的产物（.app 压缩包 + 截图 + 录屏）。

用法：
  $env:GH_TOKEN = "<你的 GitHub PAT>"        # 需要 repo 权限
  pwsh -File scripts/download-ios-artifact.ps1 -RunId 38514277113

不传 -RunId 时自动取最近一次成功的 iOS Simulator run。
走代理时先设置 $env:HTTPS_PROXY，默认按本机 7897 端口处理。
#>
param(
  [string]$RunId = "",
  [string]$Repo = "MakeMoneyy/liheng-mobile",
  [string]$Artifact = "liheng-ios-simulator",
  [string]$OutDir = "$env:TEMP\liheng-ios"
)

if (-not $env:GH_TOKEN) { throw "请先设置 `$env:GH_TOKEN（GitHub PAT，需要 repo 权限）" }
if (-not $env:HTTPS_PROXY) { $env:HTTPS_PROXY = "http://127.0.0.1:7897" }

$gh = "C:\Program Files\GitHub CLI\gh.exe"
if (-not (Test-Path -LiteralPath $gh)) { $gh = "gh" }

if (-not $RunId) {
  Write-Host "未指定 RunId，查询最近一次成功的 iOS Simulator run ..."
  $RunId = (& $gh run list --repo $Repo --workflow ios-simulator.yml `
      --status success --limit 1 --json databaseId --jq '.[0].databaseId').Trim()
  if (-not $RunId) { throw "没找到成功的 run，请显式传 -RunId" }
}
Write-Host "下载 run $RunId 的 artifact '$Artifact' 到 $OutDir"

if (Test-Path -LiteralPath $OutDir) { Remove-Item -LiteralPath $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir | Out-Null

& $gh run download $RunId --repo $Repo --name $Artifact --dir $OutDir
Get-ChildItem -Recurse $OutDir | Select-Object FullName, Length
