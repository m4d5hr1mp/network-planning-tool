// js/pages/airline-dashboard/AirlineTasksResolution.js
// Handles complex state mutations when a TODO item is marked Done.
// Each action type maps to one or more Firestore writes.

import RouteDAO      from "../../dao/RouteDAO.js";
import AirlineBaseDAO from "../../dao/AirlineBaseDAO.js";
import LoungeDAO     from "../../dao/LoungeDAO.js";
import { toast }     from "../../ui/Toast.js";

/**
 * Execute the state mutation implied by completing a TODO item.
 *
 * @param {object} item        - unified todo item (from issue inbox or local reminder)
 * @param {object} ctx         - { myId, allAirlines }
 *
 * item shape:
 *   { action, target, fromAirlineId, kind, authorId }
 *
 * Throws on validation failure — caller should catch and surface to UI.
 */
export async function executeMutation(item, { myId, allAirlines }) {
    const airlineLabel = id => {
        const a = allAirlines.find(x => x.id === id);
        return a ? a.username : id;
    };

    switch (item.action) {

        case "Add Route": {
            // target = "AMS-CDG" (IATA pair)
            if (!item.target) throw new Error("No route target specified");
            const parts = item.target.split("-");
            if (parts.length < 2) throw new Error(`Invalid route format "${item.target}", expected AMS-CDG`);
            const [origin, dest] = parts;

            // TODO (Route Flip logic):
            // Before adding, check if myId has a base at `origin`.
            // If not, check if myId has a base at `dest` — if so, flip origin↔dest.
            // If neither is a base, addForced anyway and warn user to add a base.
            // Implementation deferred — see AirlineTasksResolution notes.

            await RouteDAO.addForced({ airlineId: myId, originIata: origin, destinationIata: dest, frequency: 7 });
            toast(`✓ Route ${origin}→${dest} added to your network`);
            break;
        }

        case "Add Frequency": {
            // target = route ID owned by recipient (us, since this is in our inbox)
            if (!item.target) throw new Error("No route specified");

            // TODO: make delta configurable (currently hard-coded to +7).
            // Could be stored in item.message parsed as a number, or added as a
            // separate field in the issue schema.
            await RouteDAO.incrementFrequency(item.target, 7);
            toast("✓ Frequency increased by 7 flights/week");
            break;
        }

        case "Add Capacity": {
            // TODO: capacity tracking not yet in schema.
            // When implemented: increment route capacity fields and update
            // the assigned airplane configuration or add a new aircraft.
            toast("✓ Marked done (capacity tracking not yet implemented)");
            break;
        }

        case "Take My Route": {
            // Sender wants us to take over their route.
            // target = route ID owned by sender (fromAirlineId).
            if (!item.target) throw new Error("No route specified");
            const route = await RouteDAO.getById(item.target);
            if (!route) throw new Error("Route not found — may have already been transferred");

            // TODO (Route Flip logic):
            // Check if myId has a base at route.originIata.
            // If not but has base at route.destinationIata → flip origin↔dest before adding.
            // If neither → addForced and warn.

            await RouteDAO.delete(item.target);
            await RouteDAO.addForced({
                airlineId: myId,
                originIata: route.originIata,
                destinationIata: route.destinationIata,
                frequency: route.frequency
            });
            toast(`✓ Route ${route.originIata}→${route.destinationIata} transferred to your network`);
            break;
        }

        case "Give Me Route": {
            // We are giving one of our routes to the sender.
            // target = route ID owned by us.
            if (!item.target) throw new Error("No route specified");
            const route = await RouteDAO.getById(item.target);
            if (!route) throw new Error("Route not found — may have already been transferred");

            const senderId = item.fromAirlineId;
            if (!senderId) throw new Error("Cannot determine sender airline");

            // TODO (Route Flip logic):
            // Check if senderId has a base at route.originIata.
            // If not but has base at route.destinationIata → flip for them.
            // If neither → addForced and warn.

            await RouteDAO.delete(item.target);
            await RouteDAO.addForced({
                airlineId: senderId,
                originIata: route.originIata,
                destinationIata: route.destinationIata,
                frequency: route.frequency
            });
            toast(`✓ Route ${route.originIata}→${route.destinationIata} transferred to ${airlineLabel(senderId)}`);
            break;
        }

        case "Build Base": {
            if (!item.target) throw new Error("No IATA specified");
            await AirlineBaseDAO.add({ airlineId: myId, iata: item.target });
            toast(`✓ Base at ${item.target} added`);
            break;
        }

        case "Build Lounge": {
            if (!item.target) throw new Error("No IATA specified");
            await LoungeDAO.add({ airlineId: myId, iata: item.target, tier: 1 });
            toast(`✓ Lounge at ${item.target} built (tier 1)`);
            break;
        }

        case "Upgrade Lounge": {
            if (!item.target) throw new Error("No IATA specified");
            await LoungeDAO.upgrade({ airlineId: myId, iata: item.target });
            toast(`✓ Lounge at ${item.target} upgraded`);
            break;
        }

        case "Free Form":
        default:
            toast("✓ Marked as done");
            break;
    }
}