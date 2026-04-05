// js/dao/AirlineDAO.js
import { db } from "../core/Firebase.js";

const AirlineDAO = {
    async add({ username, displayName, passwordHash, isAdmin = false }) {
        const id  = crypto.randomUUID();
        const doc = { id, username, displayName, passwordHash, isAdmin, createdAt: new Date().toISOString() };
        await db.collection("airlines").doc(id).set(doc);
        return doc;
    },
    async getAll() {
        return (await db.collection("airlines").get()).docs.map(d => d.data());
    },
    async getById(id) {
        const d = await db.collection("airlines").doc(id).get();
        return d.exists ? d.data() : null;
    },
    async getByUsername(username) {
        const snap = await db.collection("airlines").where("username","==",username).limit(1).get();
        return snap.empty ? null : snap.docs[0].data();
    },
    async delete(id) { return db.collection("airlines").doc(id).delete(); }
};
export default AirlineDAO;