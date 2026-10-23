const $ = (id) => document.getElementById(id);
const DEFAULTS = { voiceName: "", rate: 1, pitch: 1, volume: 1, showButton: true };

const send = (msg) => chrome.runtime.sendMessage(msg);

function renderState(state) {
  const status = $("status");
  status.className = `status ${state}`;
  status.textContent = { idle: "Idle", speaking: "Reading…", paused: "Paused" }[state] || state;
  $("pause").disabled = state === "idle";
  $("stop").disabled = state === "idle";
  $("pause").textContent = state === "paused" ? "Resume" : "Pause";
}

function renderOutputs() {
  $("rateOut").textContent = `${Number($("rate").value).toFixed(1)}×`;
  $("pitchOut").textContent = Number($("pitch").value).toFixed(1);
  $("volumeOut").textContent = `${Math.round($("volume").value * 100)}%`;
}

function hint(text) {
  $("hint").textContent = text;
  if (text) setTimeout(() => { if ($("hint").textContent === text) $("hint").textContent = ""; }, 3500);
}

async function loadVoices(selected) {
  const { voices = [] } = await send({ type: "getVoices" });
  const select = $("voice");
  // group by language so long lists stay usable
  const groups = {};
  voices.forEach((v) => { (groups[v.lang || "Other"] ||= []).push(v); });
  const langs = Object.keys(groups).sort((a, b) => {
    const en = (l) => (l.toLowerCase().startsWith("en") ? 0 : 1);
    return en(a) - en(b) || a.localeCompare(b);
  });
  for (const lang of langs) {
    const og = document.createElement("optgroup");
    og.label = lang;
    groups[lang].sort((a, b) => a.name.localeCompare(b.name)).forEach((v) => {
      const o = document.createElement("option");
      o.value = v.name;
      o.textContent = v.remote ? `${v.name} (online)` : v.name;
      og.appendChild(o);
    });
    select.appendChild(og);
  }
  select.value = selected;
  if (select.value !== selected) select.value = "";
}

async function init() {
  const s = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  $("rate").value = s.rate;
  $("pitch").value = s.pitch;
  $("volume").value = s.volume;
  $("showButton").checked = s.showButton;
  renderOutputs();
  await loadVoices(s.voiceName);

  const { state } = await send({ type: "getState" });
  renderState(state);
}

// settings save immediately
$("voice").addEventListener("change", (e) => chrome.storage.sync.set({ voiceName: e.target.value }));
for (const id of ["rate", "pitch", "volume"]) {
  $(id).addEventListener("input", renderOutputs);
  $(id).addEventListener("change", (e) => chrome.storage.sync.set({ [id]: Number(e.target.value) }));
}
$("showButton").addEventListener("change", (e) => chrome.storage.sync.set({ showButton: e.target.checked }));

// controls
$("readSel").addEventListener("click", async () => {
  const { ok } = await send({ type: "readSelection" });
  if (!ok) hint("Highlight some text on the page first.");
});
$("readPage").addEventListener("click", async () => {
  const { ok } = await send({ type: "readPage" });
  if (!ok) hint("Couldn't read this page (browser pages are off-limits).");
});
$("pause").addEventListener("click", () => send({ type: "toggle" }));
$("stop").addEventListener("click", () => send({ type: "stop" }));
$("test").addEventListener("click", () =>
  send({ type: "speak", text: "Hi Louis. This is how I'll sound when I read to you." }));

// live state updates from the background worker
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "state") renderState(msg.state);
});

init();
