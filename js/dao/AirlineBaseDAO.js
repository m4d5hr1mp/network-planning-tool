// js/dao/AirlineBaseDAO.js
import { db } from "../core/Firebase.js";

const AirlineBaseDAO = {

    // acId is optional — only present on bases created via JSON import
    async add({ airlineId, iata, acId = null }) {
        const id  = crypto.randomUUID();
        const doc = { id, airlineId, iata: iata.toUpperCase(), createdAt: new Date().toISOString() };
        if (acId !== null) doc.acId = acId;
        await db.collection("airline_bases").doc(id).set(doc);
        return doc;
    },

    async getAllForAirline(airlineId) {
        const snap = await db.collection("airline_bases")
            .where("airlineId", "==", airlineId).get();
        return snap.docs.map(d => d.data());
    },

    async delete(id) {
        return db.collection("airline_bases").doc(id).delete();
    }
};

export default AirlineBaseDAO;