import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  deleteDoc, 
  writeBatch,
  QuerySnapshot,
  DocumentData 
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

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Creates a clean, plain Javascript object strictly adhering to the Fabric interface.
 * This effectively removes any circular references, DOM nodes, or internal Firestore/React 
 * properties that might be attached to the object, solving the "Converting circular structure to JSON" error.
 */
const createCleanFabricObject = (source: any): Fabric => {
  const safeString = (val: any) => (val === null || val === undefined) ? '' : String(val);

  // We explicitly reconstruct the object property by property.
  // This is a "whitelist" approach which is much safer than trying to sanitize a dirty object.
  return {
    id: safeString(source.id),
    name: safeString(source.name),
    supplier: safeString(source.supplier),
    technicalSummary: safeString(source.technicalSummary),
    specs: {
      composition: safeString(source.specs?.composition),
      weight: safeString(source.specs?.weight),
      martindale: safeString(source.specs?.martindale),
      usage: safeString(source.specs?.usage),
    },
    colors: Array.isArray(source.colors) ? source.colors.map(safeString) : [],
    // Reconstruct the colorImages map to ensure no hidden non-string objects exist
    colorImages: source.colorImages ? Object.fromEntries(
        Object.entries(source.colorImages).map(([k, v]) => [safeString(k), safeString(v)])
    ) : {},
    mainImage: safeString(source.mainImage),
    pdfUrl: safeString(source.pdfUrl),
    category: source.category === 'wood' ? 'wood' : 'model'
  };
};

/**
 * Retries an async operation with exponential backoff.
 * Essential for handling unstable connections or "Backend didn't respond" errors.
 */
const retryOperation = async <T>(operation: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> => {
    try {
        return await operation();
    } catch (error: any) {
        // Retry on connection/availability errors or timeouts
        const isConnectionError = error.code === 'unavailable' || 
                                  error.message?.includes('backend') || 
                                  error.message?.includes('network') ||
                                  error.message?.includes('offline');
        
        if (retries > 0 && isConnectionError) {
            console.warn(`Retrying Firestore operation. Attempts left: ${retries}. Error: ${error.message}`);
            await delay(delayMs);
            return retryOperation(operation, retries - 1, delayMs * 2);
        }
        throw error;
    }
};

// --- Firestore Operations ---

/**
 * Fetch all fabrics from Firestore
 */
export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  try {
    const querySnapshot = await retryOperation<QuerySnapshot<DocumentData>>(() => getDocs(collection(db, COLLECTION_NAME)));
    const fabrics: Fabric[] = [];
    querySnapshot.forEach((doc) => {
      // Clean data coming IN from Firestore too, just to be safe
      fabrics.push(createCleanFabricObject(doc.data()));
    });
    return fabrics;
  } catch (error) {
    console.error("Error getting documents: ", error);
    return [];
  }
};

/**
 * Add or Update a single fabric
 */
export const saveFabricToFirestore = async (fabric: Fabric) => {
  try {
    const cleanFabric = createCleanFabricObject(fabric);
    await retryOperation(() => setDoc(doc(db, COLLECTION_NAME, fabric.id), cleanFabric, { merge: true }));
  } catch (error) {
    console.error("Error writing document: ", error);
    throw error;
  }
};

/**
 * Save multiple fabrics at once (Batch)
 * Uses small chunks and retries to handle large Base64 payloads and connection limits.
 */
export const saveBatchFabricsToFirestore = async (fabrics: Fabric[]) => {
  // 1 item per batch is safest for heavy images to prevent "Write stream exhausted".
  const CHUNK_SIZE = 1; 
  
  // Clean all fabrics first
  const cleanFabrics = fabrics.map(createCleanFabricObject);

  console.log(`Starting batch save for ${cleanFabrics.length} items...`);

  for (let i = 0; i < cleanFabrics.length; i += CHUNK_SIZE) {
    const chunk = cleanFabrics.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    
    chunk.forEach((fabric) => {
      const docRef = doc(db, COLLECTION_NAME, fabric.id);
      batch.set(docRef, fabric); // batch.set overwrites, which is fine for new bulk uploads
    });
    
    try {
        // Execute this chunk with retry logic
        await retryOperation(() => batch.commit(), 3, 2000);
        
        console.log(`Saved batch chunk ${Math.floor(i / CHUNK_SIZE) + 1} of ${Math.ceil(cleanFabrics.length / CHUNK_SIZE)}`);
        
        // Delay to allow network buffer to clear
        await delay(1000); 

    } catch (error: any) {
        console.error("Error batch writing chunk: ", error);
        throw new Error("Conexión inestable. No se pudieron guardar todas las telas. Intente subir menos archivos.");
    }
  }
};

/**
 * Delete a single fabric
 */
export const deleteFabricFromFirestore = async (fabricId: string) => {
  try {
    await retryOperation(() => deleteDoc(doc(db, COLLECTION_NAME, fabricId)));
  } catch (error) {
    console.error("Error deleting document: ", error);
    throw error;
  }
};

/**
 * Delete all fabrics (Reset)
 */
export const clearFirestoreCollection = async () => {
  try {
    const querySnapshot = await retryOperation<QuerySnapshot<DocumentData>>(() => getDocs(collection(db, COLLECTION_NAME)));
    
    const CHUNK_SIZE = 200; 
    const docs = querySnapshot.docs;
    
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + CHUNK_SIZE);
        chunk.forEach(doc => batch.delete(doc.ref));
        
        await retryOperation(() => batch.commit());
        await delay(500); 
    }
  } catch (error) {
    console.error("Error clearing collection: ", error);
    throw error;
  }
};