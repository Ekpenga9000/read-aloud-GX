// Read Aloud GX — content script
// Shows a small floating button next to highlighted text. Clicking it sends the text
// to the background worker, which does the actual speaking.

(() => {
  if (window.__readAloudGxLoaded) return;
  window.__readAloudGxLoaded = true;

  let enabled = true;
  let host = null;
  let lastText = "";

  chrome.storage.sync.get({ showButton: true }, (s) => { enabled = s.showButton; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.showButton) {
      enabled = changes.showButton.newValue;
      if (!enabled) hide();
    }
  });

  function send(msg) {
    try { return chrome.runtime.sendMessage(msg); }
    catch { return Promise.resolve(); } // extension was reloaded; old script is orphaned
  }

  function build() {
    host = document.createElement("div");
    host.style.cssText = "position:absolute;z-index:2147483647;top:0;left:0;display:none;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        .bar { display:flex; gap:4px; padding:4px; border-radius:10px;
               background:#16131c; box-shadow:0 4px 14px rgba(0,0,0,.35);
               border:1px solid #2c2633; font:13px/1 system-ui, sans-serif; }
        button { all:unset; cursor:pointer; display:flex; align-items:center; gap:6px;
                 padding:6px 9px; border-radius:7px; color:#f4f1f6; }
        button:hover { background:#2a2331; }
        .read svg { fill:#ff2d55; }
        .stop { display:none; }
        .stop.show { display:flex; }
        .stop svg { fill:#c9c3cf; }
      </style>
      <div class="bar">
        <button class="read" title="Read aloud (Alt+Shift+R)">
          <svg width="14" height="14" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>
          Read
        </button>
        <button class="stop" title="Stop (Alt+Shift+S)">
          <svg width="12" height="12" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
        </button>
      </div>`;
    const readBtn = root.querySelector(".read");
    const stopBtn = root.querySelector(".stop");
    // mousedown would clear the page selection before click fires, so swallow it
    root.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
    readBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (lastText) send({ type: "speak", text: lastText });
      stopBtn.classList.add("show");
    });
    stopBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      send({ type: "stop" });
      hide();
    });
    host._stopBtn = stopBtn;
    (document.body || document.documentElement).appendChild(host);
  }

  function selectedText() {
    const el = document.activeElement;
    if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT") &&
        typeof el.selectionStart === "number" && el.selectionEnd > el.selectionStart) {
      return { text: el.value.slice(el.selectionStart, el.selectionEnd), rect: el.getBoundingClientRect() };
    }
    const sel = window.getSelection();
    const text = sel ? sel.toString() : "";
    if (!text.trim() || !sel.rangeCount) return null;
    const rects = sel.getRangeAt(0).getClientRects();
    const rect = rects.length ? rects[rects.length - 1] : sel.getRangeAt(0).getBoundingClientRect();
    return { text, rect };
  }

  async function show() {
    const found = selectedText();
    if (!found || found.text.trim().length < 2) return hide();
    lastText = found.text;
    if (!host || !host.isConnected) build();
    const { rect } = found;
    const top = window.scrollY + rect.bottom + 8;
    const left = Math.min(window.scrollX + rect.right - 20, window.scrollX + document.documentElement.clientWidth - 120);
    host.style.top = `${Math.max(top, 0)}px`;
    host.style.left = `${Math.max(left, window.scrollX + 4)}px`;
    host.style.display = "block";
    const res = await send({ type: "getState" });
    host._stopBtn.classList.toggle("show", !!res && res.state !== "idle");
  }

  function hide() {
    if (host) host.style.display = "none";
  }

  document.addEventListener("mouseup", (e) => {
    if (!enabled) return;
    if (host && e.composedPath().includes(host)) return;
    setTimeout(show, 10); // let the selection settle
  }, true);

  document.addEventListener("keyup", (e) => {
    // keyboard selection (Shift+arrows)
    if (enabled && e.shiftKey) setTimeout(show, 10);
  }, true);

  document.addEventListener("mousedown", (e) => {
    if (host && !e.composedPath().includes(host)) hide();
  }, true);

  document.addEventListener("selectionchange", () => {
    const s = window.getSelection();
    if (host && host.style.display === "block" && s && !s.toString().trim() &&
        !(document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName))) hide();
  });
})();
