// js/ui/Toast.js

/**
 * Show a temporary toast notification.
 * Requires a <div id="toast"> in the page body.
 * type: "success" | "error" | "warning"
 */
export function toast(msg, type = "success") {
    const container = document.getElementById("toast");
    if (!container) { console.warn("No #toast container found"); return; }

    const el = document.createElement("div");
    el.className = `toast-item ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

/**
 * Set a status message on an element.
 * @param {string|HTMLElement} target - element id string or element directly
 * @param {string} msg
 * @param {"success"|"error"|"warning"|"clear"} type
 */
export function setStatus(target, msg, type = "success") {
    const el = typeof target === "string" ? document.getElementById(target) : target;
    if (!el) return;
    el.className = `status-msg ${type === "clear" ? "" : type + "-msg"}`;
    el.textContent = msg;
}