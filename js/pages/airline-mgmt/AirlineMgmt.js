// js/pages/airline-mgmt/AirlineMgmt.js

import AirlineDAO from "../../dao/AirlineDAO.js";
import { getCurrentAirlineId, updateNavAirlineDisplay } from "../../App.js";
import * as Bases    from "./AirlineBases.js";
import * as Links    from "./AirlineLinks.js";
import * as Importer from "./AirlineDataImporter.js";

const myId = getCurrentAirlineId();
if (!myId) { alert("No airline selected."); location.href = "dashboard.html"; }

// Expose callbacks for HTML event attributes
window.onFileSelected = e  => Importer.onFileSelected(e);
window.cancelImport   = () => Importer.cancelImport();
window.confirmImport  = () => Importer.confirmImport();

window.onload = async () => {
    updateNavAirlineDisplay();

    const me = await AirlineDAO.getById(myId).catch(() => null);
    const ctxBar = document.getElementById("contextBar");
    if (ctxBar) ctxBar.innerHTML =
        `Managing: <strong>${me?.username || myId}</strong>${me?.displayName ? " — " + me.displayName : ""}`;

    // Init importer (needs myId + callback to reload tables after import)
    Importer.init(myId, {
        onImportComplete: async () => {
            await Bases.load();
            await Links.load();
        }
    });

    // Init bases — when bases change, refresh the origin dropdown in Links
    await Bases.init(myId, {
        onBaseChange: async (bases) => Links.refreshOriginSelect(bases)
    });

    // Init links
    await Links.init(myId);
    await Links.load();
};