-- 关掉 iOS 18+ 从外部打开自定义 scheme 时弹出的 “Open in …?” 确认框。
-- 该弹窗不是模拟器窗口的一部分，System Events 的窗口树里通常看不到它，
-- 所以先按设备屏幕坐标点击 Open 按钮，再兜底试回车 / 空格。
--
-- 用法: osascript scripts/dismiss-open-alert.applescript [strategy]
--   strategy: click | return | space | axclick | dump | all (默认 all)

on run argv
  set strategy to "all"
  if (count of argv) > 0 then set strategy to item 1 of argv

  tell application "Simulator" to activate
  delay 1

  if strategy is "dump" or strategy is "all" then
    tell application "System Events"
      tell process "Simulator"
        set report to "FRONTMOST: " & (name of first process whose frontmost is true) & linefeed
        set report to report & "WINDOWS: " & (count of windows) & linefeed
        repeat with w in windows
          set report to report & "  W: " & (name of w) & " pos=" & (position of w) & " size=" & (size of w) & " buttons=" & (count of buttons of w) & linefeed
          repeat with b in (buttons of w)
            set report to report & "    BTN: " & (name of b) & linefeed
          end repeat
        end repeat
        do shell script "echo " & quoted form of report
      end tell
    end tell
  end if

  if strategy is "click" or strategy is "all" then
    tell application "System Events"
      tell process "Simulator"
        set p to position of window 1
        set s to size of window 1
      end tell
      -- 模拟器窗口顶部约 28px 是标题栏，下面是设备屏幕。
      set cx to (item 1 of p) + ((item 1 of s) * 0.682)
      set cy to (item 2 of p) + 28 + (((item 2 of s) - 28) * 0.550)
      log "CLICK AT: " & cx & "," & cy
      click at {cx, cy}
    end tell
  end if

  if strategy is "axclick" or strategy is "all" then
    try
      tell application "System Events" to tell process "Simulator" to click button 1 of window 1
      log "AXCLICK OK"
    on error errMsg
      log "AXCLICK ERR: " & errMsg
    end try
  end if

  if strategy is "return" or strategy is "all" then
    tell application "System Events" to key code 36
    log "RETURN SENT"
  end if

  if strategy is "space" or strategy is "all" then
    tell application "System Events" to key code 49
    log "SPACE SENT"
  end if
end run
