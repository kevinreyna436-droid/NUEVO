import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  deleteDoc, 
  writeBatch 
} from "firebase/firestore";
import { Fabric } from "../types";

const firebaseConfig = {
  apiKey: "AIzaSyAudyiExH_syO9MdtSzn4cDxrK0p1zjnac",
  authDomain: "creata-catalogo.firebaseapp.com",
  projectId: "creata-catalogo",
  storageBucket: "creata-catalogo.firebasestorage.app",
  messagingSenderId: "667237641772",
  appId: "1:667237641772:web:4772ca31a28594bccfab89",
  measurementId: "G-74WPNT7EF6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const COLLECTION_NAME = "fabrics";

// --- Firestore Operations ---

/**
 * Fetch all fabrics from Firestore
 */
export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const fabrics: Fabric[] = [];
    querySnapshot.forEach((doc) => {
      fabrics.push(doc.data() as Fabric);
    });
    return fabrics;
  } catch (error) {
    console.error("Error getting documents: ", error);
    return [];
  }
};

/**
 * Add or Update a single fabric
 * We use setDoc with merge: true to handle both creation and updates safely
 */
export const saveFabricToFirestore = async (fabric: Fabric) => {
  try {
    await setDoc(doc(db, COLLECTION_NAME, fabric.id), fabric, { merge: true });
  } catch (error) {
    console.error("Error writing document: ", error);
    throw error;
  }
};

/**
 * Save multiple fabrics at once (Batch)
 */
export const saveBatchFabricsToFirestore = async (fabrics: Fabric[]) => {
  try {
    const batch = writeBatch(db);
    fabrics.forEach((fabric) => {
      const docRef = doc(db, COLLECTION_NAME, fabric.id);
      batch.set(docRef, fabric);
    });
    await batch.commit();
  } catch (error) {
    console.error("Error batch writing documents: ", error);
    throw error;
  }
};

/**
 * Delete all fabrics (Reset)
 * Firestore requires deleting documents one by one to clear a collection from client SDK
 */
export const clearFirestoreCollection = async () => {
  try {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const batch = writeBatch(db);
    querySnapshot.forEach((document) => {
      batch.delete(document.ref);
    });
    await batch.commit();
  } catch (error) {
    console.error("Error clearing collection: ", error);
    throw error;
  }
};
