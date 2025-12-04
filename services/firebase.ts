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
  enableIndexedDbPersistence,
  initializeFirestore,
  CACHE_SIZE_UNLIMITED,
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

// Initialize Firestore with specific settings
const db = initializeFirestore(app, {
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
});

// Attempt to enable persistence
// This allows the app to work offline and load faster on subsequent visits
enableIndexedDbPersistence(db).catch((err) => {
    // Only log safe messages
    const msg = err?.message || 'Unknown persistence error';
    if (err.code === 'failed-precondition') {
        console.warn('Persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
        console.warn('Persistence not supported by browser');
    } else {
        console.warn('Persistence error:', msg);
    }
});

const COLLECTION_NAME = "fabrics";

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Creates a clean, plain Javascript object strictly adhering to the Fabric interface.
 * This function acts as a firewall preventing circular structures (DOM nodes, Events)
 * from entering the database or state.
 */
const createCleanFabricObject = (source: any): Fabric => {
  // If source is null or not an object, return a safe default to prevent crashes
  if (!source || typeof source !== 'object') {
      return {
          id: 'error-' + Date.now(),
          name: 'Error de Datos',
          supplier: '',
          technicalSummary: '',
          specs: { composition: '', martindale: '', usage: '', weight: '' },
          colors: [],
          colorImages: {},
          mainImage: '',
          category: 'model'
      };
  }

  // Ultra-safe string converter
  const safeString = (val: any): string => {
      try {
          if (val === null || val === undefined) return '';
          if (typeof val === 'string') return val;
          if (typeof val === 'number') return String(val);
          if (typeof val === 'boolean') return String(val);
          // Reject objects/arrays/functions to avoid [object Object] or circular refs
          return ''; 
      } catch (e) { return ''; }
  };

  // Safely extract color images map
  const cleanColorImages: Record<string, string> = {};
  if (source.colorImages && typeof source.colorImages === 'object' && source.colorImages !== null) {
      try {
          Object.entries(source.colorImages).forEach(([k, v]) => {
              const key = safeString(k);
              const val = safeString(v);
              // Only keep valid base64/url strings
              // Reduced to ~300KB limit to ensure we don't accidentally blow up the 1MB Firestore doc limit
              if (key && val && val.length < 400000) { 
                  cleanColorImages[key] = val;
              }
          });
      } catch(e) { console.warn("Error cleaning colorImages"); }
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
    name: safeString(source.name) || 'Sin Nombre',
    supplier: safeString(source.supplier),
    technicalSummary: safeString(source.technicalSummary),
    specs: {
      composition: safeString(source?.specs?.composition),
      weight: safeString(source?.specs?.weight),
      martindale: safeString(source?.specs?.martindale),
      usage: safeString(source?.specs?.usage),
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
        // Safe check for error properties to avoid circular access
        const errorCode = error?.code || '';
        const errorMsg = error?.message || '';
        const isConnectionError = errorCode === 'unavailable' || 
                                  errorMsg.includes('backend') || 
                                  errorMsg.includes('network') ||
                                  errorMsg.includes('offline');
        
        if (retries > 0 && isConnectionError) {
            console.warn(`Retrying Firestore op... ${retries} attempts left.`);
            await delay(delayMs);
            return retryOperation(operation, retries - 1, delayMs * 2);
        }
        throw error;
    }
};

// --- Firestore Operations ---

/**
 * Fetch all fabrics from Firestore with a Smart Offline Strategy.
 * 
 * It races the Network request against a timer.
 * 1. If Network responds fast -> Returns server data.
 * 2. If Network is slow -> Returns Cached data immediately.
 * 3. If Network fails completely -> Returns Cached data.
 */
export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  try {
    // Define the network request
    const serverPromise = getDocs(collection(db, COLLECTION_NAME));
    
    // Define a timeout that rejects after 2.5 seconds (Balance between patience and speed)
    const timeoutPromise = new Promise<QuerySnapshot<DocumentData>>((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT_SLOW_NETWORK')), 2500)
    );

    let snapshot: QuerySnapshot<DocumentData>;

    try {
        // Race them!
        snapshot = await Promise.race([serverPromise, timeoutPromise]);
    } catch (raceError: any) {
        // If the timeout won, or the network failed immediately
        const msg = raceError?.message || '';
        const isTimeout = msg === 'TIMEOUT_SLOW_NETWORK';
        
        if (isTimeout) {
            console.log("Network is slow. Switching to offline cache for instant load.");
        } else {
            // Log safely
            console.warn("Network request failed. Attempting cache fallback.", msg);
        }

        // Fallback: Try to read from local cache
        try {
            snapshot = await getDocsFromCache(collection(db, COLLECTION_NAME));
        } catch (cacheError: any) {
            console.error("Cache fetch also failed.", cacheError?.message || 'Unknown cache error');
            return [];
        }
    }
    
    return snapshot.docs.map(doc => createCleanFabricObject(doc.data()));

  } catch (error: any) {
    // Global safety catch - LOG MESSAGE ONLY to avoid circular JSON error
    console.error("Critical error in getFabricsFromFirestore", error?.message || "Unknown error");
    return [];
  }
};

/**
 * Add or Update a single fabric
 */
export const saveFabricToFirestore = async (fabric: Fabric) => {
  try {
    // 1. Sanitize Data (Crucial Step to prevent Circular JSON)
    const cleanFabric = createCleanFabricObject(fabric);
    
    // 2. Validate ID
    if (!cleanFabric.id) throw new Error("Invalid ID");

    // 3. Write
    await retryOperation(() => setDoc(doc(db, COLLECTION_NAME, cleanFabric.id), cleanFabric, { merge: true }));
  } catch (error: any) {
    // Log message only
    console.error("Error writing document", error?.message || 'Unknown write error'); 
    throw error;
  }
};

/**
 * Save multiple fabrics at once (Batch)
 */
export const saveBatchFabricsToFirestore = async (fabrics: Fabric[]) => {
  const CHUNK_SIZE = 5; 
  
  const cleanFabrics = fabrics.map(createCleanFabricObject).filter(f => f.id);

  for (let i = 0; i < cleanFabrics.length; i += CHUNK_SIZE) {
    const chunk = cleanFabrics.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    
    chunk.forEach((fabric) => {
      const docRef = doc(db, COLLECTION_NAME, fabric.id);
      batch.set(docRef, fabric); 
    });
    
    try {
        await retryOperation(() => batch.commit(), 3, 2000);
        await delay(300); 
    } catch (error: any) {
        console.error("Error batch writing chunk", error?.message || 'Unknown batch error');
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
  } catch (error: any) {
    console.error("Error deleting document", error?.message || 'Unknown delete error');
    throw error;
  }
};

/**
 * Delete all fabrics (Reset)
 */
export const clearFirestoreCollection = async () => {
  try {
    // We use getDocs here without race condition because this is a destructive admin action
    // and we want to ensure we have the latest references, though cache is acceptable if offline.
    const snap = await getDocs(collection(db, COLLECTION_NAME));
    const batch = writeBatch(db);
    snap.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();
  } catch (error: any) {
    console.error("Error clearing collection", error?.message || 'Unknown clear error');
    throw error;
  }
};