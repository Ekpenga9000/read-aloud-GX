// Read Aloud GX — background service worker
//
// The voice lives here, not in any tab. That's why reading keeps going when you
// switch tabs: no single page owns the playback.
//
// Engine: chrome.tts (OS voices, free, offline). If a browser build doesn't expose
// chrome.tts, we fall back to an offscreen page that uses speechSynthesis.

const DEFAULTS = { voiceName: "", rate: 1, pitch: 1, volume: 1, showButton: true };
const CHUNK_LIMIT = 220; // some voices cut off on very long utterances, so we split

let state = "idle"; // "idle" | "speaking" | "paused"
let runId = 0;      // bumps on every new read, so stale events from an old read are ignored

const hasTts = () => typeof chrome.tts !== "undefined" && !!chrome.tts.speak;

// ---------- settings ----------
async function getSettings() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}

// ---------- state + badge ----------
async function setState(next) {
  state = next;
  await chrome.storage.session.set({ state });
  const badge = { idle: "", speaking: "▶", paused: "❚❚" }[next];
  chrome.action.setBadgeText({ text: badge });
  chrome.action.setBadgeBackgroundColor({ color: next === "paused" ? "#8a8a8a" : "#e5103a" });
  chrome.runtime.sendMessage({ type: "state", state: next }).catch(() => {}); // popup may be closed
}

// ---------- text chunking ----------
function chunkText(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?。！？]+[.!?。！？]+["'”’)\]]*\s*|[^.!?。！？]+$/g) || [clean];
  const chunks = [];
  let buf = "";
  for (let s of sentences) {
    s = s.trim();
    while (s.length > CHUNK_LIMIT) {
      // very long sentence: break at the last comma/space before the limit
      let cut = Math.max(s.lastIndexOf(", ", CHUNK_LIMIT), s.lastIndexOf(" ", CHUNK_LIMIT));
      if (cut < 40) cut = CHUNK_LIMIT;
      if (buf) { chunks.push(buf); buf = ""; }
      chunks.push(s.slice(0, cut + 1).trim());
      s = s.slice(cut + 1).trim();
    }
    if ((buf + " " + s).trim().length > CHUNK_LIMIT) {
      if (buf) chunks.push(buf);
      buf = s;
    } else {
      buf = (buf + " " + s).trim();
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

// ---------- engine: chrome.tts ----------
function ttsSpeak(chunks, settings, myRun) {
  chrome.tts.stop();
  chunks.forEach((chunk, i) => {
    const opts = {
      rate: Number(settings.rate),
      pitch: Number(settings.pitch),
      volume: Number(settings.volume),
      enqueue: i > 0,
      onEvent: (ev) => {
        if (myRun !== runId) return;
        if (ev.type === "error") { console.warn("TTS error:", ev.errorMessage); setState("idle"); }
        if (ev.type === "end" && i === chunks.length - 1) setState("idle");
      }
    };
    if (settings.voiceName) opts.voiceName = settings.voiceName;
    chrome.tts.speak(chunk, opts);
  });
}

// ---------- engine: offscreen speechSynthesis (fallback) ----------
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument?.()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Speak highlighted text with speechSynthesis"
  });
}
async function offscreenCmd(cmd, payload = {}) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: "offscreen", cmd, ...payload });
}

// ---------- public controls ----------
async function speak(text) {
  const chunks = chunkText(text || "");
  if (!chunks.length) return;
  const settings = await getSettings();
  const myRun = ++runId;
  await setState("speaking");
  if (hasTts()) ttsSpeak(chunks, settings, myRun);
  else await offscreenCmd("speak", { chunks, settings, run: myRun });
}

async function stop() {
  runId++;
  if (hasTts()) chrome.tts.stop();
  else await offscreenCmd("stop").catch(() => {});
  await setState("idle");
}

async function pause() {
  if (state !== "speaking") return;
  if (hasTts()) chrome.tts.pause(); else await offscreenCmd("pause");
  await setState("paused");
}

async function resume() {
  if (state !== "paused") return;
  if (hasTts()) chrome.tts.resume(); else await offscreenCmd("resume");
  await setState("speaking");
}

async function togglePause() {
  if (state === "speaking") return pause();
  if (state === "paused") return resume();
}

async function getVoices() {
  if (hasTts()) return new Promise((res) => chrome.tts.getVoices((v) => res(v.map((x) => ({ name: x.voiceName, lang: x.lang || "", remote: !!x.remote })))));
  return (await offscreenCmd("voices")) || [];
}

// ---------- grabbing text from the active tab ----------
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function getSelectionFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const el = document.activeElement;
        // selection inside a textarea/input isn't part of window.getSelection()
        if (el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && /^(text|search|url|email)$/i.test(el.type))) &&
            typeof el.selectionStart === "number" && el.selectionEnd > el.selectionStart) {
          return el.value.slice(el.selectionStart, el.selectionEnd);
        }
        return window.getSelection()?.toString() || "";
      }
    });
    return results.map((r) => r.result).find((t) => t && t.trim()) || "";
  } catch (e) {
    console.warn("Can't read selection on this page:", e.message);
    return "";
  }
}

async function getPageTextFromTab(tabId) {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const root = document.querySelector("article") || document.querySelector("main") || document.body;
        return root ? root.innerText : "";
      }
    });
    return r?.result || "";
  } catch (e) {
    console.warn("Can't read this page:", e.message);
    return "";
  }
}

async function readSelectionInActiveTab() {
  const tab = await activeTab();
  if (!tab?.id) return false;
  const text = await getSelectionFromTab(tab.id);
  if (text.trim()) { await speak(text); return true; }
  return false;
}

async function readPageInActiveTab() {
  const tab = await activeTab();
  if (!tab?.id) return false;
  const text = await getPageTextFromTab(tab.id);
  if (text.trim()) { await speak(text); return true; }
  return false;
}

// ---------- context menu ----------
chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "read-selection", title: "Read aloud", contexts: ["selection"] });
    chrome.contextMenus.create({ id: "read-page", title: "Read this page aloud", contexts: ["page"] });
    chrome.contextMenus.create({ id: "stop", title: "Stop reading", contexts: ["page", "selection"] });
  });
  const current = await chrome.storage.sync.get(null);
  await chrome.storage.sync.set({ ...DEFAULTS, ...current });
  await setState("idle");
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "read-selection") {
    // info.selectionText flattens line breaks; grab the real selection when we can
    const full = tab?.id ? await getSelectionFromTab(tab.id) : "";
    speak(full.trim() ? full : info.selectionText);
  } else if (info.menuItemId === "read-page" && tab?.id) {
    speak(await getPageTextFromTab(tab.id));
  } else if (info.menuItemId === "stop") {
    stop();
  }
});

// ---------- keyboard shortcuts ----------
chrome.commands.onCommand.addListener((command) => {
  if (command === "read-selection") readSelectionInActiveTab();
  if (command === "toggle-pause") togglePause();
  if (command === "stop-reading") stop();
});

// ---------- messages from content script + popup ----------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target === "offscreen") return; // meant for the offscreen page
  (async () => {
    switch (msg?.type) {
      case "speak": await speak(msg.text); return { ok: true };
      case "stop": await stop(); return { ok: true };
      case "pause": await pause(); return { ok: true };
      case "resume": await resume(); return { ok: true };
      case "toggle": await togglePause(); return { ok: true };
      case "getState": {
        // If the worker slept through the final "end" event, correct the state here
        if (hasTts() && state === "speaking") {
          const speaking = await new Promise((r) => chrome.tts.isSpeaking(r));
          if (!speaking) await setState("idle");
        }
        return { state };
      }
      case "getVoices": return { voices: await getVoices() };
      case "readSelection": return { ok: await readSelectionInActiveTab() };
      case "readPage": return { ok: await readPageInActiveTab() };
      case "offscreen-ended": if (msg.run === runId) await setState("idle"); return { ok: true };
      default: return { ok: false };
    }
  })().then(sendResponse);
  return true; // async response
});

// restore state if the service worker restarted mid-read
chrome.storage.session.get({ state: "idle" }).then(async ({ state: saved }) => {
  if (hasTts() && saved !== "idle") {
    chrome.tts.isSpeaking((speaking) => { state = speaking ? saved : "idle"; if (!speaking) setState("idle"); });
  } else {
    state = saved;
  }
});
