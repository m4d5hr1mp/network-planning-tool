// js/dao/RouteDAO.js
import { db } from "../core/Firebase.js";
import AirlineBaseDAO from "./AirlineBaseDAO.js";

const RouteDAO = {

    /** Standard add — enforces origin must be a base owned by airlineId. */
    async add({ airlineId, originIata, destinationIata, frequency, distance = null }) {
        const bases = await AirlineBaseDAO.getAllForAirline(airlineId);
        const baseIatas = bases.map(b => b.iata);
        if (!baseIatas.includes(originIata.toUpperCase())) {
            throw new Error(
                `${originIata} is not one of your bases (${baseIatas.join(", ") || "none"})`
            );
        }
        return RouteDAO.addForced({ airlineId, originIata, destinationIata, frequency, distance });
    },

    async addForced({ airlineId, originIata, destinationIata, frequency, distance = null }) {
        const id  = crypto.randomUUID();
        const doc = {
            id, airlineId,
            originIata: originIata.toUpperCase(),
            destinationIata: destinationIata.toUpperCase(),
            frequency: parseInt(frequency) || 7,
            createdAt: new Date().toISOString()
        };
        if (distance !== null) doc.distance = distance;
        await db.collection("routes").doc(id).set(doc);
        return doc;
    },

    async getById(id) {
        const doc = await db.collection("routes").doc(id).get();
        return doc.exists ? doc.data() : null;
    },

    async getAllForAirline(airlineId) {
        const snap = await db.collection("routes")
            .where("airlineId", "==", airlineId).get();
        return snap.docs.map(d => d.data());
    },

    async incrementFrequency(id, delta = 7) {
        const doc = await db.collection("routes").doc(id).get();
        if (!doc.exists) throw new Error("Route not found");
        const current = doc.data().frequency || 0;
        return db.collection("routes").doc(id).update({ frequency: current + delta });
    },

    async delete(id) {
        return db.collection("routes").doc(id).delete();
    }
};

export default RouteDAO;