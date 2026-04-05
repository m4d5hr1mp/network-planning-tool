// js/ui/Modal.js

export function openModal(id) {
    document.getElementById(id)?.classList.add("active");
}

export function closeModal(id) {
    document.getElementById(id)?.classList.remove("active");
}

/** Close modal when user clicks the overlay backdrop (not the modal box itself) */
export function initOverlayClose(id) {
    document.getElementById(id)?.addEventListener("click", e => {
        if (e.target === e.currentTarget) closeModal(id);
    });
}