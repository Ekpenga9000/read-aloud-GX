# Read Aloud GX

Read Aloud GX is a lightweight text-to-speech extension for Opera GX (and other Chromium browsers). Highlight any text on a web page and it reads it aloud using the voices already installed on your computer. It's free, works offline, and needs no account or API key.

## What it does

- **Reads highlighted text:** select text on any page and click the floating **Read** button, use the right-click menu, or press a keyboard shortcut.
- **Reads whole pages:** reads the main content of an article or page from the right-click menu or the popup.
- **Keeps playing across tabs:** the voice runs in the extension's background worker rather than inside a page, so you can switch tabs while it reads. You can pause, resume or stop it from whichever tab you're on.
- **Lets you customize the voice:** pick from your system voices and adjust speed, pitch and volume. Your settings are saved.
- **Handles long text smoothly:** splits long passages into sentence-sized chunks so voices don't cut off partway through.
- **Shows its status everywhere:** the toolbar badge shows ▶ while reading and ❚❚ when paused.

It's useful for listening to articles, documentation or course readings while you rest your eyes, proofreading your own writing by ear, or keeping up with long pages while doing something else.

## Installation

Read Aloud GX isn't on the Opera add-ons store yet, so you load it directly from this repository.

### 1. Get the code

**Option A: clone with Git**

```bash
git clone https://github.com/<your-username>/read-aloud-gx.git
```

**Option B: download a ZIP**

1. On this repository's GitHub page, click **Code → Download ZIP**.
2. Extract it. GitHub names the folder `read-aloud-gx-main`; you can rename it to `read-aloud-gx`.

Put the folder somewhere permanent. The browser loads the extension from that folder, so it stops working if you delete or move it.

### 2. Load it in Opera GX

1. Go to `opera://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the folder that contains `manifest.json`.
4. Pin the extension icon so the popup is one click away.
5. Refresh any tabs that were already open so the floating button appears on them.

### Other Chromium browsers

The same steps work in Chrome, Edge and Brave. Open `chrome://extensions`, `edge://extensions` or `brave://extensions` instead.

### Updating

- **If you cloned:** run `git pull` in the folder, then click the reload icon on the extension's card in `opera://extensions`.
- **If you downloaded the ZIP:** download it again, replace the old folder's contents, then click reload.

> **Using WSL?** Opera runs on Windows, so in the "Load unpacked" dialog browse to `\\wsl$\<your-distro>\home\<you>\...\read-aloud-gx`, or clone the repo on the Windows side.

## Using it

- **Highlight text** → click the floating **Read** button
- **Right-click** a selection → _Read aloud_ (or right-click the page → _Read this page aloud_)
- **Alt+Shift+R** read selection · **Alt+Shift+P** pause/resume · **Alt+Shift+S** stop
- Change shortcuts at `opera://extensions/shortcuts`
- Open the popup to change the voice, speed, pitch and volume, test a voice, or turn the floating button off.

## How it works

```
 Page (any tab)                         Extension background worker
 ┌───────────────────────┐   message   ┌──────────────────────────────┐
 │ content.js            │ ──────────► │ background.js                │
 │ floating Read button  │             │  • splits text into chunks   │
 └───────────────────────┘             │  • tracks state (badge)      │
 Right-click menu / hotkeys ─────────► │  • speaks via chrome.tts     │──► OS voices
 Popup (popup.js) ───────────────────► │    (offscreen fallback)      │
                                       └──────────────────────────────┘
```

Because the speaking happens in the background worker and not in the page, closing or switching away from a tab doesn't stop playback.

## Files

| File            | Role                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `manifest.json` | Permissions, shortcuts, content script registration                                                       |
| `background.js` | The engine: owns the voice, splits text into chunks, tracks state, handles the menu, hotkeys and messages |
| `content.js`    | Floating Read/Stop button shown next to highlighted text                                                  |
| `popup.*`       | Controls and settings (voice, speed, pitch, volume)                                                       |
| `offscreen.*`   | Fallback engine using `speechSynthesis`, only used if `chrome.tts` is unavailable                         |

## Better voices later

All speaking goes through `speak()` / `stop()` / `pause()` / `resume()` in `background.js`. To try a neural voice (a local model like Piper/Kokoro behind a small local server, or a cloud API), add a third engine alongside the `chrome.tts` and offscreen ones and play the returned audio from the offscreen page.

On Windows 11 you can also get better free voices by adding them in **Settings → Time & language → Speech**.

## Troubleshooting

- **No floating button:** refresh the tab. Pages opened before you installed the extension don't have it yet.
- **No sound:** open the popup and click **Test this voice**. If that's silent, check your system volume and try another voice.
- **Shortcut does nothing:** another app or extension may be using it. Set a different one at `opera://extensions/shortcuts`.
- **Errors after an update:** click **Errors** on the extension's card in `opera://extensions` to see what went wrong.

## Limits

Browser-internal pages (`opera://…`, the extension store) block extensions, so nothing can be read there. PDFs opened in the built-in viewer may not expose a selection to the hotkey; right-click → _Read aloud_ usually still works.
