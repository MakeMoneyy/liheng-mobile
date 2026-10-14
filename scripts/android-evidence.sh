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
# 两个必须防的坑：
#   1) runner 上 /dev/kvm 属于 kvm 组（0660）、runner 用户不在组里，action 探测
#      不到权限就会加 `-accel off`，x86_64 镜像退化成 qemu TCG 纯软件执行 ——
#      开机 969 秒、装包 5 分钟、系统连环 ANR、Maestro 驱动被拖死。workflow 里
#      先 `chmod 666 /dev/kvm`，本脚本开头再做一次断言式自检，把它打进日志。
#   2) 纯软件渲染下系统经常 ANR，弹出的 “Xxx isn't responding” 是覆盖全屏的
#      系统弹窗，会吞掉所有点击；而且只等进程起来并不代表首帧已画出来。
#
# 可调的环境变量：
#   APP_ID             包名，默认 app.liheng.mobile
#   APK_PATH           release APK 路径
#   SHOTS_DIR          截图输出目录，默认 screenshots
#   MIN_UNIQUE_SHOTS   至少要有多少张互不相同的截图，默认 6
#   FIRST_FRAME_TIMEOUT_S  等首页首帧的上限秒数，默认 180

set -euo pipefail

APP_ID="${APP_ID:-app.liheng.mobile}"
APK_PATH="${APK_PATH:-android/app/build/outputs/apk/release/app-release.apk}"
SHOTS_DIR="${SHOTS_DIR:-screenshots}"
MIN_UNIQUE_SHOTS="${MIN_UNIQUE_SHOTS:-6}"
FIRST_FRAME_TIMEOUT_S="${FIRST_FRAME_TIMEOUT_S:-180}"

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

log "硬件加速自检（KVM）"
ls -l /dev/kvm 2>/dev/null || echo "/dev/kvm 不存在或不可读"
EMULATOR_BIN="${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}/emulator/emulator"
if [ -x "${EMULATOR_BIN}" ]; then
  "${EMULATOR_BIN}" -accel-check || true
else
  echo "没找到 emulator 可执行文件：${EMULATOR_BIN}"
fi

log "安装到模拟器"
adb wait-for-device
# 关掉系统级「XX 无响应 / 已停止运行」对话框；再兜一层动画开关。
adb shell settings put global hide_error_dialogs 1 || true
adb shell settings put global window_animation_scale 0 || true
adb shell settings put global transition_animation_scale 0 || true
adb shell settings put global animator_duration_scale 0 || true
adb install -r "${APK_PATH}"

rm -rf "${SHOTS_DIR}"
mkdir -p "${SHOTS_DIR}"

# Maestro 流程里的 tab 用的是屏幕百分比坐标（y=94%），这个值是按手势导航
# 验证出来的。runner 的镜像可能默认三键导航，那样 tab bar 会整体上移、
# 坐标就点空了，所以先把导航方式统一成手势。
log "统一为手势导航（对齐 tab 坐标）"
adb shell cmd overlay enable com.android.internal.systemui.navbar.gestural || true
sleep 5

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
# 只等进程是不够的：release 冷启动要建库读 SQLite、加载打包进 APK 的中文字体，
# 首屏没画出来就交给 Maestro，第一步 assertVisible 会直接超时。这里轮询设备
# UI 层级，等到首页标题真的出现为止。
log "等首页首帧（最多 ${FIRST_FRAME_TIMEOUT_S}s）"
first_frame=no
deadline=$(( $(date +%s) + FIRST_FRAME_TIMEOUT_S ))
while [ "$(date +%s)" -lt "${deadline}" ]; do
  if adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 &&
     adb shell cat /sdcard/ui.xml 2>/dev/null | grep -q "今天的账本"; then
    first_frame=yes
    break
  fi
  sleep 3
done
echo "首页标题已出现：${first_frame}"
if [ "${first_frame}" != "yes" ]; then
  echo "::warning::首页标题一直没出现，先把当前层级与运行日志打出来"
  adb shell cat /sdcard/ui.xml 2>/dev/null | head -c 4000 || true
  echo
  adb logcat -d -t 300 "ReactNative:V" "ReactNativeJS:V" "AndroidRuntime:E" "*:S" 2>/dev/null | tail -n 80 || true
fi
adb exec-out screencap -p > "${SHOTS_DIR}/00-launched.png"

log "跑 Maestro 冒烟流程"
set +e
maestro test maestro/smoke.yaml --format junit --output maestro-report.xml
MAESTRO_RC=$?
set -e
echo "maestro exit code: ${MAESTRO_RC}"

if [ "${MAESTRO_RC}" -ne 0 ]; then
  log "Maestro 失败，补一份现场"
  adb exec-out screencap -p > "${SHOTS_DIR}/99-failure.png" || true
  adb shell cat /sdcard/ui.xml 2>/dev/null | head -c 4000 || true
  echo
  adb logcat -d -t 400 "*:E" 2>/dev/null | tail -n 100 || true
fi

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
