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
 * Implements chunking to avoid Firestore 10MB payload limit.
 */
export const saveBatchFabricsToFirestore = async (fabrics: Fabric[]) => {
  try {
    // Firestore has a limit of 10MB per request.
    // Since we are storing base64 images, we need to be conservative.
    // We'll process in chunks of 5 documents to stay safe.
    const CHUNK_SIZE = 5; 
    
    for (let i = 0; i < fabrics.length; i += CHUNK_SIZE) {
      const chunk = fabrics.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      
      chunk.forEach((fabric) => {
        const docRef = doc(db, COLLECTION_NAME, fabric.id);
        batch.set(docRef, fabric);
      });
      
      // Execute this chunk
      await batch.commit();
      console.log(`Saved batch chunk ${Math.floor(i / CHUNK_SIZE) + 1} of ${Math.ceil(fabrics.length / CHUNK_SIZE)}`);
    }
  } catch (error) {
    console.error("Error batch writing documents: ", error);
    throw error;
  }
};

/**
 * Delete a single fabric
 */
export const deleteFabricFromFirestore = async (fabricId: string) => {
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, fabricId));
  } catch (error) {
    console.error("Error deleting document: ", error);
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
    
    // Deleting in batches is also more efficient and safer
    const CHUNK_SIZE = 500; // Delete limit is just operation count (500), payload is small
    const docs = querySnapshot.docs;
    
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + CHUNK_SIZE);
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
  } catch (error) {
    console.error("Error clearing collection: ", error);
    throw error;
  }
};