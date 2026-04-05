// js/pages/Login.js
import { signInWithPasskey } from "../Authentication.js";

const input  = document.getElementById("passkeyInput");
const btn    = document.getElementById("loginBtn");
const status = document.getElementById("status");

async function login() {
    status.textContent = "";
    btn.disabled = true;
    btn.textContent = "Authenticating…";

    try {
        await signInWithPasskey(input.value.trim());
        window.location.href = "dashboard.html";
    } catch(e) {
        status.textContent = e.message;
        btn.disabled = false;
        btn.textContent = "Continue";
    }
}

btn.addEventListener("click", login);
input.addEventListener("keydown", e => { if (e.key === "Enter") login(); });