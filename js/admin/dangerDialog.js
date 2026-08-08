/* =========================================================
   Shared "this cannot be undone" confirmation dialog.

   Used anywhere a delete cascades into child data the admin might
   not expect to lose (deleting a subject also deletes its quizzes
   and their questions; deleting a quiz also deletes its questions).
   A plain confirm() is too easy to click through on autopilot for
   something this destructive, so this requires typing the exact
   name of the thing being deleted before the delete button enables.

   Renders as a fixed-position overlay appended directly to
   document.body — not scoped to any admin tab's #adminContent — so
   it's unaffected by the tab-switch DOM-replacement race documented
   elsewhere in this project. It's an independent element until it
   explicitly closes itself. (The cascade delete that runs *after*
   confirmation still needs its own currentContainer guard in the
   calling file, since that part isn't blocked by a visible overlay.)

   Usage:
     const confirmed = await confirmDangerousDelete({
       title: `Delete "${subject.name}"?`,
       itemName: subject.name,
       warningLines: [
         "This will also permanently delete 3 quizzes.",
         "This will also permanently delete 12 questions.",
       ],
     });
     if (!confirmed) return;
========================================================= */

let activeDialogCleanup = null;

export function confirmDangerousDelete({ title, itemName, warningLines = [] }) {
  // Defensive: if a previous dialog was somehow left open, close it
  // (as a cancel) before opening a new one, rather than stacking
  // overlays.
  activeDialogCleanup?.();

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "danger-dialog-overlay";

    overlay.innerHTML = `
      <div class="danger-dialog" role="alertdialog" aria-modal="true">
        <h3 class="danger-dialog-title">${escapeHtml(title)}</h3>

        <div class="danger-dialog-warning">
          <p class="danger-dialog-cannot-undo">This cannot be undone.</p>
          ${warningLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
        </div>

        <label class="danger-dialog-confirm-label" for="dangerConfirmInput">
          Type <strong>${escapeHtml(itemName)}</strong> to confirm:
        </label>
        <input
          type="text"
          id="dangerConfirmInput"
          class="danger-dialog-input"
          autocomplete="off"
        />

        <div class="danger-dialog-actions">
          <button type="button" class="btn-secondary" id="dangerCancelBtn">
            Cancel
          </button>
          <button type="button" class="btn-danger" id="dangerConfirmBtn" disabled>
            Delete Permanently
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector("#dangerConfirmInput");
    const confirmBtn = overlay.querySelector("#dangerConfirmBtn");
    const cancelBtn = overlay.querySelector("#dangerCancelBtn");

    function cleanup() {
      overlay.remove();
      document.removeEventListener("keydown", onKeydown);
      activeDialogCleanup = null;
    }

    function finish(result) {
      cleanup();
      resolve(result);
    }

    function onKeydown(e) {
      if (e.key === "Escape") finish(false);
    }

    input.addEventListener("input", () => {
      confirmBtn.disabled = input.value !== itemName;
    });

    confirmBtn.addEventListener("click", () => {
      if (input.value === itemName) finish(true);
    });

    cancelBtn.addEventListener("click", () => finish(false));

    // Clicking the dark backdrop (outside the dialog box) also cancels.
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) finish(false);
    });

    document.addEventListener("keydown", onKeydown);
    activeDialogCleanup = () => finish(false);

    input.focus();
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
