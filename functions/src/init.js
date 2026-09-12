// Shared Firebase Admin initialization + exported handles.
// Every module imports { db, admin, FieldValue, Timestamp } from here so we
// only ever init the app once.
const admin = require("firebase-admin");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

module.exports = { admin, db, FieldValue, Timestamp };
