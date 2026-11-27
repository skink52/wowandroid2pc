import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import { AdbDaemonWebUsbDevice, AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import { AdbScrcpyClient, AdbScrcpyOptionsLatest } from "@yume-chan/adb-scrcpy";
import { Int16PcmPlayer } from "@yume-chan/pcm-player";
import {
  AndroidKeyCode, AndroidKeyEventAction, AndroidKeyEventMeta, AndroidMotionEventAction,
  AndroidScreenPowerMode, DefaultServerPath, ScrcpyPointerId,
} from "@yume-chan/scrcpy";
import { WebCodecsVideoDecoder, WebGLVideoFrameRenderer } from "@yume-chan/scrcpy-decoder-webcodecs";
import { ReadableStream, WritableStream } from "@yume-chan/stream-extra";
import serverUrl from "./server.bin?url";

const APP = "app.wowforever";
const params = new URLSearchParams(location.search);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("screen");
const btnConnect = $<HTMLButtonElement>("connect");
const btnPlay = $<HTMLButtonElement>("play");
const chkScreenOff = $<HTMLInputElement>("screenoff");
const status = (s: string) => ($("status").textContent = s);

const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
const credentials = new AdbWebCredentialStore("wow2pc");

type Client = AdbScrcpyClient<AdbScrcpyOptionsLatest<true>>;
let adb: Adb | undefined;
let client: Client | undefined;
let player: Int16PcmPlayer | undefined;
let vw = 0, vh = 0;
let busy = false;

try { chkScreenOff.checked = localStorage.getItem("screenoff") === "1"; } catch {}

async function connect(device: AdbDaemonWebUsbDevice) {
  if (busy || client) return;
  busy = true;
  try {
    status("Connecting… (if the phone asks, tap Allow)");
    const connection = await device.connect();
    const transport = await AdbDaemonTransport.authenticate({ serial: device.serial, connection, credentialStore: credentials });
    adb = new Adb(transport);
    status("Starting stream…");
    const bin = new Uint8Array(await (await fetch(serverUrl)).arrayBuffer());
    await AdbScrcpyClient.pushServer(adb, new ReadableStream({ start(c) { c.enqueue(bin); c.close(); } }));
    const options = new AdbScrcpyOptionsLatest({
      videoCodec: (params.get("codec") as "h264" | "h265" | "av1") ?? "h264",
      videoBitRate: Number(params.get("bitrate") ?? 16) * 1_000_000,
      maxFps: Number(params.get("fps") ?? 60),
      maxSize: Number(params.get("size") ?? 0),
      audio: true,
      audioCodec: "raw",
      stayAwake: true,
      powerOffOnClose: false,
    });
    client = await AdbScrcpyClient.start(adb, DefaultServerPath, options);
    void client.output.pipeTo(new WritableStream({ write: (l) => console.log("[scrcpy]", l) })).catch(() => {});

    const video = await client.videoStream;
    const decoder = new WebCodecsVideoDecoder({ codec: video.metadata.codec, renderer: new WebGLVideoFrameRenderer(canvas) });
    decoder.sizeChanged(({ width, height }) => { vw = width; vh = height; });
    void video.stream.pipeTo(decoder.writable).catch(() => {});

    const audio = await client.audioStream;
    if (audio?.type === "success") {
      void audio.stream.pipeTo(new WritableStream({
        write(p) { if (p.type === "data" && player) player.feed(new Int16Array(p.data.slice().buffer)); },
      })).catch(() => {});
    }

    await client.controller!.startApp(APP);
    if (chkScreenOff.checked) setTimeout(() => client?.controller?.setScreenPowerMode(AndroidScreenPowerMode.Off), 1500);

    document.body.classList.add("streaming");
    btnPlay.disabled = false;
    btnConnect.disabled = true;
    status(`Streaming ${device.name}. Click Play fullscreen (or the picture) to start sound and capture keys.`);
    void client.exited.then(() => cleanup("Stream ended. Reconnect the phone or click Connect phone."));
  } catch (e) {
    console.error(e);
    const msg = e instanceof AdbDaemonWebUsbDevice.DeviceBusyError
      ? "Phone is busy: close any other ADB program on this PC (adb, scrcpy, Android Studio, other tabs) and reconnect."
      : `Couldn't connect: ${(e as Error).message ?? e}`;
    await cleanup(msg);
  } finally {
    busy = false;
  }
}

async function cleanup(msg: string) {
  const c = client; client = undefined;
  try { await c?.close(); } catch {}
  try { await adb?.close(); } catch {}
  adb = undefined;
  await player?.stop().catch(() => {}); player = undefined;
  document.body.classList.remove("streaming", "playing");
  btnPlay.disabled = true;
  btnConnect.disabled = false;
  status(msg);
}

async function play() {
  if (!client) return;
  if (!player) { player = new Int16PcmPlayer(48000, 2); await player.start(); }
  try {
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    await (navigator as any).keyboard?.lock?.();
  } catch {}
  canvas.focus();
}

document.addEventListener("fullscreenchange", () => {
  document.body.classList.toggle("playing", !!document.fullscreenElement);
  if (!document.fullscreenElement) (navigator as any).keyboard?.unlock?.();
});

// ---- Mouse: forwarded as a real Android mouse (all buttons go to the game; right click is NOT Back) ----
function point(e: MouseEvent) {
  const r = canvas.getBoundingClientRect();
  const s = Math.min(r.width / vw, r.height / vh);
  const x = (e.clientX - r.left - (r.width - vw * s) / 2) / s;
  const y = (e.clientY - r.top - (r.height - vh * s) / 2) / s;
  return { pointerX: Math.max(0, Math.min(vw, x)), pointerY: Math.max(0, Math.min(vh, y)), videoWidth: vw, videoHeight: vh };
}
const BTN = [1, 4, 2, 8, 16]; // DOM button index -> Android button bit (DOM e.buttons bits already match Android)
function touch(e: MouseEvent, action: AndroidMotionEventAction, actionButton = 0) {
  if (!client?.controller || !vw) return;
  void client.controller.injectTouch({
    action, pointerId: ScrcpyPointerId.Mouse, ...point(e),
    pressure: e.buttons ? 1 : 0, actionButton, buttons: e.buttons,
  });
}
canvas.addEventListener("mousedown", (e) => {
  e.preventDefault(); canvas.focus();
  if (!document.body.classList.contains("playing") && !player) { void play(); }
  touch(e, AndroidMotionEventAction.Down, BTN[e.button] ?? 0);
});
window.addEventListener("mouseup", (e) => { if (client) touch(e, AndroidMotionEventAction.Up, BTN[e.button] ?? 0); });
canvas.addEventListener("mousemove", (e) => touch(e, e.buttons ? AndroidMotionEventAction.Move : AndroidMotionEventAction.HoverMove));
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("auxclick", (e) => e.preventDefault());
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (!client?.controller || !vw) return;
  const k = e.deltaMode === 0 ? 1 / 100 : 1;
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  void client.controller.injectScroll({ ...point(e), scrollX: clamp(-e.deltaX * k), scrollY: clamp(-e.deltaY * k), buttons: e.buttons });
}, { passive: false });

// ---- Keyboard: physical key codes mapped to Android key codes ----
const pressed = new Set<number>();
function meta(e: KeyboardEvent) {
  let m = 0;
  if (e.shiftKey) m |= AndroidKeyEventMeta.Shift | AndroidKeyEventMeta.ShiftLeft;
  if (e.ctrlKey) m |= AndroidKeyEventMeta.Ctrl | AndroidKeyEventMeta.CtrlLeft;
  if (e.altKey) m |= AndroidKeyEventMeta.Alt | AndroidKeyEventMeta.AltLeft;
  if (e.metaKey) m |= AndroidKeyEventMeta.Meta | AndroidKeyEventMeta.MetaLeft;
  if (e.getModifierState("CapsLock")) m |= AndroidKeyEventMeta.CapsLock;
  if (e.getModifierState("NumLock")) m |= AndroidKeyEventMeta.NumLock;
  return m as AndroidKeyEventMeta;
}
function key(e: KeyboardEvent, action: AndroidKeyEventAction) {
  if (!client?.controller || !document.body.classList.contains("streaming")) return;
  const code = (AndroidKeyCode as Record<string, number>)[e.code];
  if (code === undefined) return;
  e.preventDefault();
  if (action === AndroidKeyEventAction.Down) pressed.add(code); else pressed.delete(code);
  void client.controller.injectKeyCode({ action, keyCode: code as AndroidKeyCode, repeat: e.repeat ? 1 : 0, metaState: meta(e) });
}
window.addEventListener("keydown", (e) => key(e, AndroidKeyEventAction.Down));
window.addEventListener("keyup", (e) => key(e, AndroidKeyEventAction.Up));
window.addEventListener("blur", () => {
  for (const code of pressed) void client?.controller?.injectKeyCode({ action: AndroidKeyEventAction.Up, keyCode: code as AndroidKeyCode, repeat: 0, metaState: 0 as AndroidKeyEventMeta });
  pressed.clear();
});

// ---- UI + auto-connect ----
chkScreenOff.addEventListener("change", () => {
  try { localStorage.setItem("screenoff", chkScreenOff.checked ? "1" : "0"); } catch {}
  void client?.controller?.setScreenPowerMode(chkScreenOff.checked ? AndroidScreenPowerMode.Off : AndroidScreenPowerMode.Normal);
});
btnPlay.addEventListener("click", () => void play());
btnConnect.addEventListener("click", async () => {
  if (!manager) return;
  const d = await manager.requestDevice().catch(() => undefined);
  if (d) await connect(d);
});

async function autoConnect() {
  if (!manager || client || busy) return;
  const [d] = await manager.getDevices();
  if (d) await connect(d);
}

if (!manager || !("VideoDecoder" in window)) {
  btnConnect.disabled = true;
  status("This browser can't do it. Open this page in Chrome or Edge (and make sure WebUSB isn't blocked by your organisation).");
} else {
  navigator.usb.addEventListener("connect", () => setTimeout(autoConnect, 1000));
  navigator.usb.addEventListener("disconnect", () => { if (client) void cleanup("Phone unplugged. Plug it back in to resume."); });
  void autoConnect();
}
