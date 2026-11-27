# wowandroid2pc

Streams WoW Forever (`app.wowforever`) from an Android phone to a Windows PC over USB, and lets you play it with the PC's keyboard and mouse. It uses [scrcpy](https://github.com/Genymobile/scrcpy), downloaded on first run to `%LOCALAPPDATA%\wow2pc`. No admin rights and no install on the phone.

## Phone setup (once)
1. Settings → About phone → Software information → tap **Build number** 7 times.
2. Settings → Developer options → turn on **USB debugging**.
3. Plug in the phone, run `wow2pc.cmd`, and accept the **Allow USB debugging** prompt on the phone (tick *Always allow*).

## Use
| Command | Effect |
|---|---|
| `wow2pc.cmd` | Start streaming now. Opens WoW Forever on the phone if it isn't already open. |
| `wow2pc.cmd -Install` | Start a background watcher now and at every logon. It opens the stream when the phone is plugged in **and** WoW Forever is in focus. |
| `wow2pc.cmd -Uninstall` | Remove the watcher. |

Options (they work with `-Install` too): `-Fullscreen`, `-ScreenOff` (phone screen off while streaming), `-MaxFps 60`, `-BitRate 16M`, `-MaxSize 1920`, `-MouseMode sdk|uhid`, `-KeyboardMode uhid|sdk`, `-Wifi ip:port`.

## Controls
- Keyboard: sent to the phone as a real hardware keyboard (`uhid`). If keys come out wrong, set the layout on the phone (Settings → General management → Physical keyboard) or use `-KeyboardMode sdk`.
- Mouse: `sdk` (default) uses the PC cursor directly, and every mouse button goes to the game. `uhid` makes the phone see a real mouse and locks the cursor in the window. Press Left Alt or Left Win to release it.
- scrcpy shortcuts use Left Ctrl + Left Alt, so they don't clash with WoW keybinds. For example, Ctrl+Alt+F toggles fullscreen.
- Log: `%LOCALAPPDATA%\wow2pc\wow2pc.log`

## If USB isn't detected (no driver, PC locked down)
Windows 10/11 normally installs the ADB driver by itself. If it doesn't, use Wireless debugging instead. This needs no driver, but the phone and PC must be on the same network.
1. Developer options → **Wireless debugging** → **Pair device with pairing code**.
2. `%LOCALAPPDATA%\wow2pc\scrcpy\scrcpy-win64-*\adb.exe pair <ip:pairport> <code>`
3. `wow2pc.cmd -Wifi <ip:port>`, using the port shown on the Wireless debugging screen. This port changes after the phone restarts.
