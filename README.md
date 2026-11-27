# wowandroid2pc

Play WoW Forever (`app.wowforever`), running on an Android phone, on a Windows PC: the PC shows the game and sends its keyboard and mouse to the phone. **Nothing is installed on the PC.** It is a web page that talks to the phone over USB (WebUSB) in Chrome or Edge. Built on [Tango / ya-webadb](https://github.com/yume-chan/ya-webadb) and [scrcpy](https://github.com/Genymobile/scrcpy).

## Phone (one-time)
1. Settings → About phone → Software information → tap **Build number** 7 times.
2. Settings → Developer options → **USB debugging** on.
3. Settings → Developer options → **Disable adb authorization timeout** on, so the PC stays allowed beyond 7 days.
4. Settings → Security and privacy → **Auto Blocker** off, or at least its "Block commands by USB cable" option. Auto Blocker blocks USB debugging.

## PC
1. Plug in the phone and open the page in Chrome or Edge.
2. Click **Connect phone**, pick the phone, and tap **Allow** on the phone (tick *Always allow*).
3. Click **Play fullscreen** or click the picture. To leave fullscreen, hold Esc.

After the first time, keep the page open or bookmarked. It connects and opens WoW Forever on its own whenever the phone is plugged in.

Options are set in the URL: `?codec=h265`, `?bitrate=24` (in Mbit/s), `?fps=60`, `?size=1920` (largest dimension in pixels).

## Troubleshooting
- **"Phone is busy"**: another ADB program on the PC (adb, scrcpy, Android Studio, another tab) is holding the phone. Close it.
- **Phone not listed in the picker**: set the phone's USB mode to *File transfer*, or try another cable or port.
- **"This browser can't do it"**: use Chrome or Edge. Some work PCs block WebUSB through policy.

## Build / hosting
`web/` is the source. `cd web && npm ci && npm run build` gives `web/dist/`. A single `index.html` is all you need. The workflow in `.github/workflows/pages.yml` publishes it to GitHub Pages. Pages needs the repo to be public, or a GitHub Pro/Team plan for a private repo. Enable it in Settings → Pages → Source: *GitHub Actions*.
