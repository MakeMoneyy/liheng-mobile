<#
下载 GitHub Actions 的模拟器产物（App 安装包 + 截图 + 报告）。

用法：
  $env:GH_TOKEN = "<你的 GitHub PAT>"          # 需要 repo 权限
  pwsh -File scripts/download-artifacts.ps1 -Platform ios
  pwsh -File scripts/download-artifacts.ps1 -Platform android -RunId 38515118225

不传 -RunId 时自动取该平台最近一次成功的 run。
走代理时先设置 $env:HTTPS_PROXY，默认按本机 7897 端口处理。
#>
param(
  [ValidateSet("ios", "android")]
  [string]$Platform = "ios",
  [string]$RunId = "",
  [string]$Repo = "MakeMoneyy/liheng-mobile",
  [string]$OutDir = ""
)

if (-not $env:GH_TOKEN) { throw "请先设置 `$env:GH_TOKEN（GitHub PAT，需要 repo 权限）" }
if (-not $env:HTTPS_PROXY) { $env:HTTPS_PROXY = "http://127.0.0.1:7897" }

$gh = "C:\Program Files\GitHub CLI\gh.exe"
if (-not (Test-Path -LiteralPath $gh)) { $gh = "gh" }

if ($Platform -eq "ios") {
  $workflow = "ios-simulator.yml"
  $artifact = "liheng-ios-simulator"
} else {
  $workflow = "android-simulator.yml"
  $artifact = "liheng-android-emulator"
}

if (-not $OutDir) { $OutDir = "$env:TEMP\liheng-$Platform" }

if (-not $RunId) {
  Write-Host "未指定 RunId，查询最近一次成功的 $workflow ..."
  $RunId = (& $gh run list --repo $Repo --workflow $workflow `
      --status success --limit 1 --json databaseId --jq '.[0].databaseId').Trim()
  if (-not $RunId) { throw "没找到成功的 run，请显式传 -RunId" }
}
Write-Host "下载 run $RunId 的 artifact '$artifact' 到 $OutDir"

if (Test-Path -LiteralPath $OutDir) { Remove-Item -LiteralPath $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir | Out-Null

& $gh run download $RunId --repo $Repo --name $artifact --dir $OutDir
Get-ChildItem -Recurse $OutDir | Select-Object FullName, Length
