let backHandler = null;

window.addEventListener("popstate", () => {
  if (typeof backHandler === "function") {
    backHandler();
  }
});

export function registerBackHandler(handler) {
  backHandler = handler;
}
