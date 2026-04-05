// js/pages/airline-dashboard/AirlineTasks.js
// Manages the unified TODO panel: inbox issues + local reminders.
// Also owns the "Add Item" compose modal (issues to other airlines + self-reminders).

import IssueDAO, { ISSUE_TYPES, TARGET_TYPE } from "../../dao/IssueDAO.js";
import RouteDAO from "../../dao/RouteDAO.js";
import { openModal, closeModal, initOverlayClose } from "../../ui/Modal.js";
import { toast } from "../../ui/Toast.js";
import { attachAirportSearch } from "../../AirportSearch.js";
import { executeMutation } from "./AirlineTasksResolution.js";

// ── Module state ──────────────────────────────────────────────────────────────

let _myId          = null;
let _myUsername    = "";
let _allAirlines   = [];
let _inboxIssues   = [];
let _myRoutes      = [];
let _recipientRoutes = [];
let _currentTab    = "routes";

const TAB_TYPES = {
    routes: ["Add Route", "Add Frequency", "Add Capacity", "Take My Route", "Give Me Route"],
    infra:  ["Build Base", "Build Lounge", "Upgrade Lounge", "Free Form"]
};
const REQUIRES_OTHER = new Set(["Take My Route", "Give Me Route"]);

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * @param {object} ctx
 * @param {string}   ctx.myId
 * @param {string}   ctx.myUsername
 * @param {Array}    ctx.allAirlines
 * @param {Array}    ctx.inboxIssues
 * @param {Array}    ctx.myRoutes
 */
export function init(ctx) {
    _myId        = ctx.myId;
    _myUsername  = ctx.myUsername;
    _allAirlines = ctx.allAirlines;
    _inboxIssues = ctx.inboxIssues;
    _myRoutes    = ctx.myRoutes;

    loadReminders();
    setupComposModal();
    setupTodoEventDelegation();
    setupTabButtons();
}

/** Call after a mutation to refresh route list (route may have been added/removed). */
export async function refreshMyRoutes() {
    _myRoutes = await RouteDAO.getAllForAirline(_myId);
}

export function updateInboxIssues(issues) {
    _inboxIssues = issues;
}

// ── Reminders (localStorage) ──────────────────────────────────────────────────

let _myReminders = [];

function loadReminders()  { _myReminders = JSON.parse(localStorage.getItem(`reminders_${_myId}`) || "[]"); }
function saveReminders()  { localStorage.setItem(`reminders_${_myId}`, JSON.stringify(_myReminders)); }
function getIgnored()     { return JSON.parse(localStorage.getItem(`ignored_${_myId}`) || "[]"); }
function setIgnored(arr)  { localStorage.setItem(`ignored_${_myId}`, JSON.stringify(arr)); }

// ── Tab switching ─────────────────────────────────────────────────────────────

function setupTabButtons() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            _currentTab = btn.dataset.tab;
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            renderTodos();
        });
    });
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderTodos() {
    const filterMine = document.getElementById("filterMine")?.checked;
    const ignored    = getIgnored();
    const types      = TAB_TYPES[_currentTab];

    const issueItems = _inboxIssues
        .filter(i => types.includes(i.type))
        .map(i => ({
            id: i.id, kind: "issue",
            author: airlineLabel(i.fromAirlineId), authorId: i.fromAirlineId,
            fromAirlineId: i.fromAirlineId,
            action: i.type, target: i.target, comment: i.message,
            status: i.status, ignored: ignored.includes(i.id), createdAt: i.createdAt
        }));

    const reminderItems = _myReminders
        .filter(r => types.includes(r.action))
        .map(r => ({
            id: r.id, kind: "reminder",
            author: _myUsername, authorId: _myId, fromAirlineId: _myId,
            action: r.action, target: r.target, comment: r.comment,
            status: r.status, ignored: false, createdAt: r.createdAt
        }));

    let items = [...issueItems, ...reminderItems];
    if (filterMine) items = items.filter(i => i.authorId === _myId);

    const rank = i => i.status === "resolved" ? 2 : i.ignored ? 1 : 0;
    items.sort((a, b) => rank(a) - rank(b) || new Date(a.createdAt) - new Date(b.createdAt));

    const body = document.getElementById("todoBody");
    if (!body) return;

    if (!items.length) {
        body.innerHTML = `<div class="todo-empty">Nothing here yet.</div>`;
        return;
    }

    body.innerHTML = `
    <table class="todo-table">
        <thead><tr>
            <th style="width:90px">Author</th>
            <th style="width:155px">Action</th>
            <th style="width:110px">Target</th>
            <th>Comment</th>
            <th style="width:215px">Actions</th>
        </tr></thead>
        <tbody>
        ${items.map(item => {
            const isOwn      = item.authorId === _myId;
            const isResolved = item.status === "resolved";
            let actions = "";
            if (!isResolved) {
                actions += `<button class="btn btn-sm btn-success"
                    data-action="done" data-kind="${item.kind}" data-id="${item.id}">Done!</button>`;
                if (!isOwn && !item.ignored)
                    actions += `<button class="btn btn-sm btn-subtle"
                        data-action="ignore" data-kind="${item.kind}" data-id="${item.id}">Ignore</button>`;
                if (isOwn)
                    actions += `<button class="btn btn-sm btn-danger"
                        data-action="delete" data-kind="${item.kind}" data-id="${item.id}">Delete</button>`;
            } else {
                actions = `<span class="muted" style="font-size:12px">resolved</span>`;
            }
            return `<tr class="${item.ignored ? "ignored" : ""}" data-row-id="${item.id}">
                <td>${isOwn ? `<span class="author-me">Me</span>` : `<span>${esc(item.author)}</span>`}</td>
                <td><span class="action-tag">${esc(item.action)}</span></td>
                <td>${item.target ? `<span class="target-code">${esc(item.target)}</span>` : `<span class="muted">—</span>`}</td>
                <td class="comment-cell" title="${esc(item.comment)}">${item.comment ? esc(item.comment) : `<span class="muted">—</span>`}</td>
                <td><div class="actions-cell" data-actions-id="${item.id}">${actions}</div></td>
            </tr>`;
        }).join("")}
        </tbody>
    </table>`;
}

// ── Event delegation on todo table ────────────────────────────────────────────

function setupTodoEventDelegation() {
    document.getElementById("todoBody")?.addEventListener("click", async e => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const { action, kind, id } = btn.dataset;
        await handleTodoAction(action, kind, id, btn);
    });

    document.getElementById("filterMine")?.addEventListener("change", renderTodos);
}

async function handleTodoAction(action, kind, id, triggerBtn) {
    if (action === "done") {
        const item = kind === "issue"
            ? _inboxIssues.find(x => x.id === id)
            : _myReminders.find(x => x.id === id);
        if (!item) { renderTodos(); return; }

        // Show working state
        const actionsEl = triggerBtn?.closest(".actions-cell");
        if (actionsEl) actionsEl.innerHTML = `<span class="muted" style="font-size:12px">Working…</span>`;

        try {
            await executeMutation(item, { myId: _myId, allAirlines: _allAirlines });
        } catch(e) {
            toast(`✗ ${e.message}`, "error");
            renderTodos();
            return;
        }

        if (kind === "issue") {
            await IssueDAO.resolve(id);
            try { _inboxIssues = await IssueDAO.getInbox(_myId); } catch(_) {}
        } else {
            const r = _myReminders.find(x => x.id === id);
            if (r) r.status = "resolved";
            saveReminders(); loadReminders();
        }

        await refreshMyRoutes();

    } else if (action === "ignore") {
        const arr = getIgnored();
        if (!arr.includes(id)) arr.push(id);
        setIgnored(arr);

    } else if (action === "delete" && kind === "reminder") {
        _myReminders = _myReminders.filter(x => x.id !== id);
        saveReminders(); loadReminders();
    }

    renderTodos();
}

// ── Compose modal ─────────────────────────────────────────────────────────────

function setupComposModal() {
    initOverlayClose("itemModal");

    document.getElementById("itemModal")?.addEventListener("click", e => {
        if (e.target === e.currentTarget) closeModal("itemModal");
    });
}

export function openItemModal() {
    const toEl  = document.getElementById("composeTo");
    const typEl = document.getElementById("composeType");
    const msgEl = document.getElementById("composeMessage");

    if (toEl)  toEl.value  = "";
    if (typEl) typEl.value = "";
    if (msgEl) msgEl.value = "";

    const cc = document.getElementById("charCount");
    if (cc) cc.textContent = "0";

    const sec = document.getElementById("targetSection");
    if (sec) sec.style.display = "none";

    document.getElementById("itemError").textContent = "";

    rebuildTypeSelect(false);
    populateRecipientSelect();
    openModal("itemModal");
    setTimeout(() => document.getElementById("composeTo")?.focus(), 50);
}

export function closeItemModal() {
    closeModal("itemModal");
}

function rebuildTypeSelect(isSelf) {
    const sel = document.getElementById("composeType");
    if (!sel) return;
    sel.innerHTML = `<option value="">— select type —</option>`;
    ISSUE_TYPES
        .filter(t => !(isSelf && REQUIRES_OTHER.has(t)))
        .forEach(t => {
            const o = document.createElement("option");
            o.value = t; o.textContent = t; sel.appendChild(o);
        });
}

function populateRecipientSelect() {
    const sel = document.getElementById("composeTo");
    if (!sel) return;

    // Preserve __self__ option, rebuild rest
    sel.innerHTML = "";

    const blank = new Option("— select —", "");
    const self  = new Option("📌 Self — Reminder (stored locally)", "__self__");
    sel.appendChild(blank);
    sel.appendChild(self);

    const others = _allAirlines.filter(a => a.id !== _myId);
    if (others.length) {
        const sep = document.createElement("option");
        sep.disabled = true; sep.textContent = "── Airlines ──";
        sel.appendChild(sep);
        others.forEach(a => {
            const o = new Option(`${a.username}${a.displayName ? " — " + a.displayName : ""}`, a.id);
            sel.appendChild(o);
        });
    }
}

// Called from HTML onchange on #composeTo
export async function onRecipientChange() {
    const toVal  = document.getElementById("composeTo")?.value;
    const isSelf = toVal === "__self__";

    const sub  = document.getElementById("modalSub");
    const lbl  = document.getElementById("messageLabel");
    if (sub) sub.textContent = isSelf
        ? "Reminder — stored locally, visible only to you"
        : "Request — sent to the selected airline";
    if (lbl) lbl.textContent = isSelf ? "Comment (optional)" : "Message (optional; required for Free Form)";

    rebuildTypeSelect(isSelf);
    const typEl = document.getElementById("composeType");
    if (typEl) typEl.value = "";
    const sec = document.getElementById("targetSection");
    if (sec) sec.style.display = "none";

    _recipientRoutes = (!isSelf && toVal) ? await RouteDAO.getAllForAirline(toVal) : [];
}

// Called from HTML onchange on #composeType
export function onTypeChange() {
    const type = document.getElementById("composeType")?.value;
    const sec  = document.getElementById("targetSection");
    if (!sec) return;
    if (!type) { sec.style.display = "none"; return; }

    const tt = TARGET_TYPE[type];
    let html = "";

    if (tt === "iata_pair") {
        html = `<div class="field"><label>Origin → Destination IATA</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <input id="tA" placeholder="Origin e.g. AMS" maxlength="3" style="text-transform:uppercase" autocomplete="off">
                <input id="tB" placeholder="Dest e.g. CDG"   maxlength="3" style="text-transform:uppercase" autocomplete="off">
            </div></div>`;
    } else if (tt === "recipient_route") {
        const opts = _recipientRoutes.length
            ? _recipientRoutes.map(r => `<option value="${r.id}">${esc(routeLabel(r))}</option>`).join("")
            : `<option value="" disabled>No routes found for this airline</option>`;
        html = `<div class="field"><label>Recipient's route</label>
            <select id="tRoute"><option value="">— select —</option>${opts}</select></div>`;
    } else if (tt === "sender_route") {
        const opts = _myRoutes.length
            ? _myRoutes.map(r => `<option value="${r.id}">${esc(routeLabel(r))}</option>`).join("")
            : `<option value="" disabled>You have no routes yet</option>`;
        html = `<div class="field"><label>Your route to transfer</label>
            <select id="tRoute"><option value="">— select —</option>${opts}</select></div>`;
    } else if (tt === "iata") {
        html = `<div class="field"><label>Airport IATA</label>
            <input id="tIata" placeholder="e.g. AMS" maxlength="3" style="text-transform:uppercase" autocomplete="off"></div>`;
    }

    sec.innerHTML = html;
    sec.style.display = html ? "block" : "none";

    // Attach airport search to injected text inputs
    if (tt === "iata_pair") {
        const a = document.getElementById("tA");
        const b = document.getElementById("tB");
        if (a) attachAirportSearch(a);
        if (b) attachAirportSearch(b);
    } else if (tt === "iata") {
        const el = document.getElementById("tIata");
        if (el) attachAirportSearch(el);
    }
}

function readTarget(type) {
    const tt = TARGET_TYPE[type];
    if (tt === "iata_pair") {
        const a = (document.getElementById("tA")?.value || "").trim().toUpperCase();
        const b = (document.getElementById("tB")?.value || "").trim().toUpperCase();
        if (!a || !b) throw new Error("Both IATA codes required");
        return `${a}-${b}`;
    }
    if (tt === "recipient_route" || tt === "sender_route") {
        const v = document.getElementById("tRoute")?.value;
        if (!v) throw new Error("Select a route");
        return v;
    }
    if (tt === "iata") {
        const v = (document.getElementById("tIata")?.value || "").trim().toUpperCase();
        if (!v || v.length !== 3) throw new Error("Valid 3-letter IATA required");
        return v;
    }
    return null;
}

export async function saveItem() {
    const toVal   = document.getElementById("composeTo")?.value;
    const isSelf  = toVal === "__self__";
    const type    = document.getElementById("composeType")?.value;
    const message = document.getElementById("composeMessage")?.value.trim();
    const errEl   = document.getElementById("itemError");
    if (errEl) errEl.textContent = "";

    if (!toVal)  { if (errEl) errEl.textContent = "Select a recipient or Self"; return; }
    if (!type)   { if (errEl) errEl.textContent = "Select a type"; return; }
    if (type === "Free Form" && !message) { if (errEl) errEl.textContent = "Free Form requires a message"; return; }

    let target;
    try { target = readTarget(type); } catch(e) { if (errEl) errEl.textContent = e.message; return; }

    if (isSelf) {
        _myReminders.push({
            id: crypto.randomUUID(), action: type,
            target: target || null, comment: message || "",
            status: "open", createdAt: new Date().toISOString()
        });
        saveReminders(); loadReminders();
        toast("📌 Reminder saved");
    } else {
        try {
            await IssueDAO.add({ fromAirlineId: _myId, toAirlineId: toVal, type, target, message });
            toast("✉ Request sent");
        } catch(e) { if (errEl) errEl.textContent = e.message; return; }
    }

    closeItemModal();
    renderTodos();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const esc        = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const routeLabel = r => `${r.originIata}→${r.destinationIata} ×${r.frequency}/wk`;
const airlineLabel = id => { const a = _allAirlines.find(x => x.id === id); return a ? a.username : id; };