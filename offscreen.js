// Fallback engine: only used if the browser doesn't expose chrome.tts.
// Runs in a hidden offscreen page, so like the main engine it isn't tied to any tab.

function loadVoices() {
  return new Promise((resolve) => {
    const v = speechSynthesis.getVoices();
    if (v.length) return resolve(v);
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
    setTimeout(() => resolve(speechSynthesis.getVoices()), 1500);
  });
}

async function speak(chunks, settings, run) {
  speechSynthesis.cancel();
  const voices = await loadVoices();
  const voice = voices.find((v) => v.name === settings.voiceName);
  chunks.forEach((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk);
    if (voice) u.voice = voice;
    u.rate = Number(settings.rate);
    u.pitch = Number(settings.pitch);
    u.volume = Number(settings.volume);
    if (i === chunks.length - 1) {
      u.onend = () => chrome.runtime.sendMessage({ type: "offscreen-ended", run });
    }
    speechSynthesis.speak(u);
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "offscreen") return;
  switch (msg.cmd) {
    case "speak": speak(msg.chunks, msg.settings, msg.run); sendResponse(true); break;
    case "stop": speechSynthesis.cancel(); sendResponse(true); break;
    case "pause": speechSynthesis.pause(); sendResponse(true); break;
    case "resume": speechSynthesis.resume(); sendResponse(true); break;
    case "voices":
      loadVoices().then((v) => sendResponse(v.map((x) => ({ name: x.name, lang: x.lang, remote: !x.localService }))));
      return true;
  }
});
