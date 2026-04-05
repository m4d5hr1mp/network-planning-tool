// js/pages/airline-dashboard/AirlineDashboard.js

import AirlineDAO from "../../dao/AirlineDAO.js";
import RouteDAO   from "../../dao/RouteDAO.js";
import IssueDAO   from "../../dao/IssueDAO.js";
import { getCurrentAirlineId, updateNavAirlineDisplay } from "../../App.js";
import { populateStatistics } from "./AirlineStatistics.js";

// ── Dynamic import of AirlineTasks with full diagnostic logging ───────────────
// If the module fails to evaluate, the static import gives a misleading
// "doesn't provide export" error. Dynamic import gives us the real cause.

let tasksInit, tasksRenderTodos, openItemModal, closeItemModal,
    saveItem, onRecipientChange, onTypeChange;

try {
    console.log("[Dashboard] Attempting to import AirlineTasks.js...");
    const Tasks = await import("./AirlineTasks.js");
    console.log("[Dashboard] AirlineTasks.js loaded. Exports:", Object.keys(Tasks));

    tasksInit         = Tasks.init;
    tasksRenderTodos  = Tasks.renderTodos;
    openItemModal     = Tasks.openItemModal;
    closeItemModal    = Tasks.closeItemModal;
    saveItem          = Tasks.saveItem;
    onRecipientChange = Tasks.onRecipientChange;
    onTypeChange      = Tasks.onTypeChange;

    // Verify each one
    const fns = { tasksInit, tasksRenderTodos, openItemModal, closeItemModal, saveItem, onRecipientChange, onTypeChange };
    for (const [name, fn] of Object.entries(fns)) {
        if (typeof fn !== "function") {
            console.error(`[Dashboard] '${name}' is not a function — got:`, fn);
        }
    }
    console.log("[Dashboard] All AirlineTasks exports verified OK");

} catch(e) {
    console.error("[Dashboard] AirlineTasks.js FAILED to import:", e);
    console.error("[Dashboard] Error name:", e.name);
    console.error("[Dashboard] Error message:", e.message);
    console.error("[Dashboard] Error stack:", e.stack);
}

// ── Also individually diagnose each dep AirlineTasks imports ─────────────────
window.addEventListener("load", async () => {
    console.log("[Diag] Testing AirlineTasks dependencies individually...");

    const deps = [
        ["IssueDAO",              "./../../dao/IssueDAO.js"],
        ["RouteDAO",              "../../dao/RouteDAO.js"],
        ["Modal",                 "../../ui/Modal.js"],
        ["Toast",                 "../../ui/Toast.js"],
        ["AirportSearch",         "../../AirportSearch.js"],
        ["AirlineTasksResolution","./AirlineTasksResolution.js"],
    ];

    for (const [name, path] of deps) {
        try {
            const mod = await import(path);
            console.log(`[Diag] ✓ ${name} — exports:`, Object.keys(mod));
        } catch(e) {
            console.error(`[Diag] ✗ ${name} FAILED:`, e.message);
        }
    }
});

// ── Guard ─────────────────────────────────────────────────────────────────────
const myId = getCurrentAirlineId();
if (!myId) {
    window.addEventListener("load", () => {
        alert("No airline selected.");
        location.href = "dashboard.html";
    });
    throw new Error("No airline session");
}

// ── Expose to HTML ────────────────────────────────────────────────────────────
window.openItemModal     = (...a) => openItemModal?.(...a);
window.closeItemModal    = (...a) => closeItemModal?.(...a);
window.saveItem          = (...a) => saveItem?.(...a);
window.onRecipientChange = (...a) => onRecipientChange?.(...a);
window.onTypeChange      = (...a) => onTypeChange?.(...a);
window.renderTodos       = (...a) => tasksRenderTodos?.(...a);

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener("load", async () => {
    updateNavAirlineDisplay();

    let me, routes, inboxIssues, allAirlines;

    try {
        [me, routes] = await Promise.all([
            AirlineDAO.getById(myId),
            RouteDAO.getAllForAirline(myId)
        ]);
    } catch(e) {
        console.error("[Dashboard] Failed to load airline data:", e);
        me = null; routes = [];
    }

    try {
        allAirlines = await AirlineDAO.getAll();
    } catch(e) {
        console.error("[Dashboard] Failed to load airlines:", e);
        allAirlines = [];
    }

    try {
        inboxIssues = await IssueDAO.getInbox(myId);
    } catch(e) {
        console.warn("[Dashboard] Inbox query failed:", e.message);
        inboxIssues = [];
        const todoBody = document.getElementById("todoBody");
        if (todoBody) todoBody.innerHTML =
            `<div class="todo-empty" style="color:var(--warning)">
                ⚠ Firestore index still building — refresh in ~1 minute.
            </div>`;
    }

    const myUsername = me?.username || myId;
    const headerTitle = document.getElementById("headerAirlineName");
    if (headerTitle) headerTitle.textContent = myUsername;

    populateStatistics(me, routes);

    if (typeof tasksInit === "function") {
        tasksInit({ myId, myUsername, allAirlines, inboxIssues, myRoutes: routes });
        tasksRenderTodos();
    } else {
        console.error("[Dashboard] tasksInit is not available — AirlineTasks failed to load");
        const todoBody = document.getElementById("todoBody");
        if (todoBody) todoBody.innerHTML =
            `<div class="todo-empty" style="color:var(--danger)">
                ✗ Failed to load task module — check console for details.
            </div>`;
    }
});