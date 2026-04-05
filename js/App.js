// js/App.js
// Owns: current airline session state, nav display, page load auth guard.
// Auth operations (hashing, sign-in, logout) live in Authentication.js.

import { PASSPHRASE_HASH, auth } from "./core/Firebase.js";
import { logout, ensureFirebaseSession } from "./Authentication.js";

// ── Session state ─────────────────────────────────────────────────────────────

export function getCurrentAirlineId() {
    return localStorage.getItem("currentAirlineId") || null;
}

export function setCurrentAirlineId(id) {
    localStorage.setItem("currentAirlineId", id);
    updateNavAirlineDisplay();
}

export function setCurrentAirlineDisplay(label) {
    localStorage.setItem("currentAirlineDisplay", label);
    updateNavAirlineDisplay();
}

export function updateNavAirlineDisplay() {
    const el = document.getElementById("currentAirlineDisplay");
    if (!el) return;
    const label = localStorage.getItem("currentAirlineDisplay") || getCurrentAirlineId();
    el.textContent = label ? `✈ ${label}` : "";
}

// ── Auth guard ────────────────────────────────────────────────────────────────
// Runs on every page load except login.html.
// Requires both:
//   1. Valid passkey hash in localStorage (Layer 1)
//   2. Active Firebase anonymous session (Firestore token)

window.addEventListener("load", async () => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("login.html") || path.endsWith("/") || path === "") return;

    const storedHash = localStorage.getItem("passkeyHash");
    if (storedHash !== PASSPHRASE_HASH) {
        window.location.href = "login.html";
        return;
    }

    try {
        await ensureFirebaseSession();
    } catch(e) {
        console.error("Failed to restore Firebase session:", e);
        window.location.href = "login.html";
    }
});

// Expose logout globally so inline onclick="logout()" in any page works
window.logout = logout;

export { logout };