import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

// Values from your Firebase project's web app registration.
const firebaseConfig = {
  apiKey: "AIzaSyDXX0NwRcZaDF-vh5NzHTvCv50ZJ6zTrvM",
  authDomain: "speaking-c002a.firebaseapp.com",
  projectId: "speaking-c002a",
  storageBucket: "speaking-c002a.firebasestorage.app",
  messagingSenderId: "62129040587",
  appId: "1:62129040587:web:cf024af720627841e7bf4e",
  measurementId: "G-11ETP2DTYR",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

const COLLECTION = "classdata";

// Same shape as the old window.storage helpers, backed by Firestore instead.
export async function loadClassDataRaw(cls) {
  try {
    const snap = await getDoc(doc(db, COLLECTION, cls));
    if (snap.exists()) return snap.data().json;
  } catch (e) {
    console.error("Firestore read failed", e);
  }
  return null;
}

export async function saveClassDataRaw(cls, jsonString) {
  try {
    await setDoc(doc(db, COLLECTION, cls), { json: jsonString, updatedAt: Date.now() });
    return true;
  } catch (e) {
    console.error("Firestore write failed", e);
    return false;
  }
}
