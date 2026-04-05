// js/dao/IssueDAO.js
import { db } from "../core/Firebase.js";

export const ISSUE_TYPES = [
    "Add Route", "Add Frequency", "Add Capacity",
    "Take My Route", "Give Me Route",
    "Build Base", "Build Lounge", "Upgrade Lounge",
    "Free Form"
];

export const TARGET_TYPE = {
    "Add Route":      "iata_pair",
    "Add Frequency":  "recipient_route",
    "Add Capacity":   "recipient_route",
    "Take My Route":  "sender_route",
    "Give Me Route":  "recipient_route",
    "Build Base":     "iata",
    "Build Lounge":   "iata",
    "Upgrade Lounge": "iata",
    "Free Form":      "none"
};

const IssueDAO = {
    async add({ fromAirlineId, toAirlineId, type, target, message }) {
        if (!ISSUE_TYPES.includes(type)) throw new Error(`Unknown type: ${type}`);
        if (message?.length > 1024) throw new Error("Message exceeds 1024 characters");
        const id  = crypto.randomUUID();
        const doc = { id, fromAirlineId, toAirlineId, type, target: target||null, message: message||"", status: "open", createdAt: new Date().toISOString() };
        await db.collection("issues").doc(id).set(doc);
        return doc;
    },
    async getInbox(airlineId) {
        return (await db.collection("issues").where("toAirlineId","==",airlineId).orderBy("createdAt","desc").get()).docs.map(d => d.data());
    },
    async getOutbox(airlineId) {
        return (await db.collection("issues").where("fromAirlineId","==",airlineId).orderBy("createdAt","desc").get()).docs.map(d => d.data());
    },
    async resolve(id) { return db.collection("issues").doc(id).update({ status: "resolved" }); },
    async delete(id)  { return db.collection("issues").doc(id).delete(); }
};
export default IssueDAO;