// js/Authentication.js
// Owns: passkey hashing, Firebase anonymous sign-in, airline credential login/create, logout.
// Does NOT own session state (current airline id etc.) — that lives in App.js.

import { PASSPHRASE_HASH, auth } from "./core/Firebase.js";
import AirlineDAO from "./dao/AirlineDAO.js";

// ── Crypto ────────────────────────────────────────────────────────────────────

export async function hashString(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Layer 1: team passkey ─────────────────────────────────────────────────────

export function isPasskeyValid() {
    return localStorage.getItem("passkeyHash") === PASSPHRASE_HASH;
}

/**
 * Validate passkey string, store hash, sign in anonymously with Firebase.
 * Throws on wrong passkey or Firebase auth failure.
 */
export async function signInWithPasskey(passkeyInput) {
    if (passkeyInput.length !== 32) throw new Error("Must be exactly 32 hex characters");

    const hash = await hashString(passkeyInput);
    if (hash !== PASSPHRASE_HASH) throw new Error("Wrong passkey");

    localStorage.setItem("passkeyHash", hash);
    await auth.signInAnonymously();
}

/** Re-establish Firebase anonymous session without re-entering passkey (e.g. after token expiry). */
export async function ensureFirebaseSession() {
    if (!auth.currentUser) await auth.signInAnonymously();
}

// ── Layer 2: airline credentials ──────────────────────────────────────────────

/**
 * Look up airline by username, verify password hash.
 * Returns the airline doc on success, throws on failure.
 */
export async function loginWithCredentials(username, password) {
    if (!username || !password) throw new Error("Username and password required");

    const airline = await AirlineDAO.getByUsername(username);
    if (!airline) throw new Error(`No airline with username "${username}"`);

    const hash = await hashString(password);
    if (hash !== airline.passwordHash) throw new Error("Wrong password");

    return airline;
}

/**
 * Create a new airline account.
 * Returns the created airline doc, throws if username already taken or password too short.
 */
export async function createAirlineAccount(username, displayName, password) {
    if (!username || !displayName || !password) throw new Error("All fields required");
    if (password.length < 6) throw new Error("Password must be at least 6 characters");

    const existing = await AirlineDAO.getByUsername(username);
    if (existing) throw new Error(`Username "${username}" is already taken`);

    const passwordHash = await hashString(password);
    return AirlineDAO.add({ username, displayName, passwordHash });
}

// ── Logout ────────────────────────────────────────────────────────────────────

export function logout() {
    auth.signOut().catch(() => {});
    localStorage.removeItem("passkeyHash");
    localStorage.removeItem("currentAirlineId");
    localStorage.removeItem("currentAirlineDisplay");
    window.location.href = "login.html";
}