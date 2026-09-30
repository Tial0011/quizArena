/* Non-blocking messages. window.alert() freezes the page (and on a
   phone it shows the site address in a scary browser dialog), so every
   alert() in the app is routed here instead. confirm() is untouched:
   it has to return an answer. */
let host = null;

export function showToast(message, ms = 4200) {
  const text = String(message ?? "").trim();
  if (!text) return;
  if (!host || !host.isConnected) {
    host = document.createElement("div");
    host.className = "qa-toast-host";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = "qa-toast";
  el.textContent = text;
  host.appendChild(el);
  // Longer messages stay longer (about 60ms per character, min = ms).
  const life = Math.max(ms, Math.min(text.length * 60, 9000));
  const close = () => {
    el.classList.add("is-out");
    setTimeout(() => el.remove(), 260);
  };
  el.addEventListener("click", close);
  setTimeout(close, life);
}

export function installToastAlert() {
  window.alert = (msg) => showToast(msg);
}
