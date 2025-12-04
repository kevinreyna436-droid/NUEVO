import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  getDocsFromCache,
  setDoc, 
  doc, 
  deleteDoc, 
  writeBatch,
  QuerySnapshot,
  DocumentData,
  enableIndexedDbPersistence,
  initializeFirestore,
  CACHE_SIZE_UNLIMITED
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

// Initialize Firestore with specific settings to improve stability
const db = initializeFirestore(app, {
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
});

// Enable Offline Persistence with robust error handling
// We execute this immediately to ensure it's ready before any operation
const setupPersistence = async () => {
    try {
        await enableIndexedDbPersistence(db);
        console.log("Offline persistence enabled");
    } catch (err: any) {
        if (err.code === 'failed-precondition') {
            console.warn('Persistence failed: Multiple tabs open');
        } else if (err.code === 'unimplemented') {
            console.warn('Persistence not supported by browser');
        }
    }
};
setupPersistence();

const COLLECTION_NAME = "fabrics";

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Creates a clean, plain Javascript object strictly adhering to the Fabric interface.
 * Prevents "Converting circular structure to JSON" errors by forcing primitive types.
 */
const createCleanFabricObject = (source: any): Fabric => {
  // Ultra-safe string converter that rejects objects/functions/symbols
  const safeString = (val: any): string => {
      if (val === null || val === undefined) return '';
      if (typeof val === 'string') return val;
      if (typeof val === 'number') return String(val);
      if (typeof val === 'boolean') return String(val);
      // If it's any object (DOM node, React ref, Image, Blob), return empty string to be safe
      return ''; 
  };

  // Safely extract color images map
  const cleanColorImages: Record<string, string> = {};
  if (source.colorImages && typeof source.colorImages === 'object') {
      Object.entries(source.colorImages).forEach(([k, v]) => {
          const key = safeString(k);
          const val = safeString(v);
          if (key && val) {
              cleanColorImages[key] = val;
          }
      });
  }

  // Safely extract colors array
  const cleanColors: string[] = [];
  if (Array.isArray(source.colors)) {
      source.colors.forEach((c: any) => {
          const s = safeString(c);
          if (s) cleanColors.push(s);
      });
  }

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
    colors: cleanColors,
    colorImages: cleanColorImages,
    mainImage: safeString(source.mainImage),
    pdfUrl: safeString(source.pdfUrl),
    category: source.category === 'wood' ? 'wood' : 'model'
  };
};

/**
 * Retries an async operation with exponential backoff.
 */
const retryOperation = async <T>(operation: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> => {
    try {
        return await operation();
    } catch (error: any) {
        const isConnectionError = error.code === 'unavailable' || 
                                  error.message?.includes('backend') || 
                                  error.message?.includes('network') ||
                                  error.message?.includes('offline') ||
                                  error.message?.includes('Cloud Firestore backend');
        
        if (retries > 0 && isConnectionError) {
            console.warn(`Retrying Firestore op. Attempts left: ${retries}`);
            await delay(delayMs);
            return retryOperation(operation, retries - 1, delayMs * 2);
        }
        throw error;
    }
};

// --- Firestore Operations ---

/**
 * Fetch all fabrics from Firestore.
 * Implements a "Server First, Cache Fallback" strategy.
 */
export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  try {
    // Try server first with timeout protection via Promise.race
    // If server takes too long (e.g. 5s), fallback to cache immediately
    const serverPromise = getDocs(collection(db, COLLECTION_NAME));
    
    // Create a timeout promise that rejects
    const timeoutPromise = new Promise<QuerySnapshot<DocumentData>>((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), 5000)
    );

    let querySnapshot: QuerySnapshot<DocumentData>;
    
    try {
        querySnapshot = await Promise.race([serverPromise, timeoutPromise]);
    } catch (e) {
        // If server timed out or failed, try cache explicitly
        console.warn("Server fetch failed/timed out, falling back to cache.");
        try {
            querySnapshot = await getDocsFromCache(collection(db, COLLECTION_NAME));
        } catch (cacheErr) {
            // If cache also fails, return empty array to prevent crash
            console.error("Cache fetch failed", cacheErr);
            return [];
        }
    }

    const fabrics: Fabric[] = [];
    querySnapshot.forEach((doc) => {
      // Very important: clean data coming OUT of DB too
      fabrics.push(createCleanFabricObject(doc.data()));
    });
    return fabrics;
  } catch (error) {
    console.error("Error getting documents: ", error);
    // Return empty array instead of crashing app on read failure
    return [];
  }
};

/**
 * Add or Update a single fabric
 */
export const saveFabricToFirestore = async (fabric: Fabric) => {
  try {
    // 1. Sanitize Data
    const cleanFabric = createCleanFabricObject(fabric);
    
    // 2. Validate ID
    if (!cleanFabric.id) throw new Error("Invalid ID");

    // 3. Write
    await retryOperation(() => setDoc(doc(db, COLLECTION_NAME, cleanFabric.id), cleanFabric, { merge: true }));
  } catch (error) {
    console.error("Error writing document: ", error);
    throw error;
  }
};

/**
 * Save multiple fabrics at once (Batch)
 */
export const saveBatchFabricsToFirestore = async (fabrics: Fabric[]) => {
  const CHUNK_SIZE = 5; // Increased slightly as 1 is too slow, 5 is safe for text/base64
  
  const cleanFabrics = fabrics.map(createCleanFabricObject).filter(f => f.id);

  console.log(`Starting batch save for ${cleanFabrics.length} items...`);

  for (let i = 0; i < cleanFabrics.length; i += CHUNK_SIZE) {
    const chunk = cleanFabrics.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    
    chunk.forEach((fabric) => {
      const docRef = doc(db, COLLECTION_NAME, fabric.id);
      batch.set(docRef, fabric); 
    });
    
    try {
        await retryOperation(() => batch.commit(), 3, 2000);
        console.log(`Saved batch chunk ${Math.floor(i / CHUNK_SIZE) + 1}`);
        await delay(500); 
    } catch (error: any) {
        console.error("Error batch writing chunk: ", error);
        throw new Error("Error al guardar lote. Verifique su conexión.");
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
    // We need to fetch references directly to delete them
    // We use a simple getDocs here, as we are online if we are resetting
    const snap = await getDocs(collection(db, COLLECTION_NAME));
    
    const batch = writeBatch(db);
    snap.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();

  } catch (error) {
    console.error("Error clearing collection: ", error);
    throw error;
  }
};