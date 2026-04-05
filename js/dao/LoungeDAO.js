// js/dao/LoungeDAO.js
import { db } from "../core/Firebase.js";

const LoungeDAO = {

    async add({ airlineId, iata, tier = 1 }) {
        // Prevent duplicates — check if lounge already exists at this airport for this airline
        const existing = await LoungeDAO.getByAirlineAndIata(airlineId, iata);
        if (existing) throw new Error(`${iata} lounge already exists (tier ${existing.tier})`);

        const id  = crypto.randomUUID();
        const doc = { id, airlineId, iata: iata.toUpperCase(), tier, createdAt: new Date().toISOString() };
        await db.collection("lounges").doc(id).set(doc);
        return doc;
    },

    async upgrade({ airlineId, iata }) {
        const lounge = await LoungeDAO.getByAirlineAndIata(airlineId, iata);
        if (!lounge) throw new Error(`No lounge found at ${iata} for this airline`);
        return db.collection("lounges").doc(lounge.id).update({ tier: lounge.tier + 1 });
    },

    async getByAirlineAndIata(airlineId, iata) {
        const snap = await db.collection("lounges")
            .where("airlineId", "==", airlineId)
            .where("iata", "==", iata.toUpperCase())
            .limit(1).get();
        return snap.empty ? null : snap.docs[0].data();
    },

    async getAllForAirline(airlineId) {
        const snap = await db.collection("lounges")
            .where("airlineId", "==", airlineId).get();
        return snap.docs.map(d => d.data());
    },

    async delete(id) {
        return db.collection("lounges").doc(id).delete();
    }
};

export default LoungeDAO;