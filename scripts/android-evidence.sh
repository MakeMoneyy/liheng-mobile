#!/usr/bin/env bash
#
# Android 模拟器上的「装 APK → 拉起 App → 跑 Maestro → 收截图 → 自检」。
# 由 .github/workflows/android-simulator.yml 的 android-emulator-runner 步骤调用。
#
# 为什么必须单独成一个文件：那个 action 把 `script:` 里的内容**逐行**丢给
# `sh -c` 执行，每一行都是一个独立进程 —— 变量不跨行、if/while 这种多行结构
# 直接语法报错（`/usr/bin/sh: 1: Syntax error: end of file unexpected`），
# 而且那个 sh 是 dash，不认识 `set -o pipefail`。放在这里用 bash 跑就没这些坑。
#
# 可调的环境变量：
#   APP_ID             包名，默认 app.liheng.mobile
#   APK_PATH           release APK 路径
#   SHOTS_DIR          截图输出目录，默认 screenshots
#   MIN_UNIQUE_SHOTS   至少要有多少张互不相同的截图，默认 6

set -euo pipefail

APP_ID="${APP_ID:-app.liheng.mobile}"
APK_PATH="${APK_PATH:-android/app/build/outputs/apk/release/app-release.apk}"
SHOTS_DIR="${SHOTS_DIR:-screenshots}"
MIN_UNIQUE_SHOTS="${MIN_UNIQUE_SHOTS:-6}"

export PATH="$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000

log() { printf '\n=== %s ===\n' "$*"; }

log "检查 release APK"
if [ ! -f "${APK_PATH}" ]; then
  echo "::error::没找到 release APK：${APK_PATH}"
  find android/app/build/outputs -name '*.apk' || true
  exit 1
fi
ls -la "${APK_PATH}"

log "安装到模拟器"
adb wait-for-device
adb install -r "${APK_PATH}"

rm -rf "${SHOTS_DIR}"
mkdir -p "${SHOTS_DIR}"

# 与 iOS 相同的约定：先由外部把 App 拉到前台，再交给 Maestro 接管，
# 这样流程里不需要 launchApp（iOS 18+ 上 launchApp 会弹 SpringBoard 确认框）。
log "拉起 App 并等首帧"
adb shell monkey -p "${APP_ID}" -c android.intent.category.LAUNCHER 1 || true
ready=no
for _ in $(seq 1 20); do
  if adb shell pidof "${APP_ID}" >/dev/null 2>&1; then
    ready=yes
    break
  fi
  sleep 2
done
echo "进程已启动：${ready}"
# 冷启动要读 SQLite、加载中文字体，进程起来之后再给几秒首帧时间
sleep 25
adb exec-out screencap -p > "${SHOTS_DIR}/00-launched.png"

log "跑 Maestro 冒烟流程"
set +e
maestro test maestro/smoke.yaml --format junit --output maestro-report.xml
MAESTRO_RC=$?
set -e
echo "maestro exit code: ${MAESTRO_RC}"

# Maestro 把 takeScreenshot 的输出放在
#   $HOME/.maestro/tests/<时间戳>/<flow>/takeScreenshot/shots/
log "收集截图"
MAESTRO_SHOTS="$(find "$HOME/.maestro/tests" -type d -path '*takeScreenshot/shots' 2>/dev/null | sort | tail -n 1 || true)"
echo "maestro shots dir: ${MAESTRO_SHOTS:-<none>}"
if [ -n "${MAESTRO_SHOTS}" ]; then
  cp "${MAESTRO_SHOTS}"/*.png "${SHOTS_DIR}/" || true
fi
ls -la "${SHOTS_DIR}"

# 哈希自检：导航若失效，多张截图会完全一致。
log "截图去重自检"
md5sum "${SHOTS_DIR}"/*.png
UNIQUE="$(md5sum "${SHOTS_DIR}"/*.png | awk '{print $1}' | sort -u | wc -l | tr -d ' ')"
TOTAL="$(ls "${SHOTS_DIR}"/*.png | wc -l | tr -d ' ')"
echo "unique screenshots: ${UNIQUE}/${TOTAL}"

if [ "${UNIQUE}" -lt "${MIN_UNIQUE_SHOTS}" ]; then
  echo "::error::截图重复过多（${UNIQUE}/${TOTAL}），导航很可能没生效"
  exit 1
fi
if [ "${MAESTRO_RC}" -ne 0 ]; then
  echo "::error::Maestro 流程失败（exit ${MAESTRO_RC}），看上面的输出与 maestro-report.xml"
  exit 1
fi

log "全部通过"
