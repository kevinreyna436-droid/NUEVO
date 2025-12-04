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

// Initialize Firestore with specific settings
const db = initializeFirestore(app, {
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
});

// Attempt to enable persistence
// This allows the app to work offline and load faster on subsequent visits
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
        console.warn('Persistence not supported by browser');
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
              if (key && val && val.length < 5000000) { // Safety check on size if needed
                  cleanColorImages[key] = val;
              }
          });
      } catch(e) { console.warn("Error cleaning colorImages", e); }
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
        const isConnectionError = error.code === 'unavailable' || 
                                  error.message?.includes('backend') || 
                                  error.message?.includes('network') ||
                                  error.message?.includes('offline');
        
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
 * Fetch all fabrics from Firestore.
 * Strategy: Standard getDocs with automatic SDK offline handling.
 * If strictly offline/unreachable and SDK throws, explicit fallback to cache.
 */
export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  try {
    // We do NOT use a timeout here anymore. We let Firebase SDK handle the connection.
    // If backend doesn't respond in 10s, the SDK might throw or return from cache if configured.
    const snapshot = await getDocs(collection(db, COLLECTION_NAME));
    
    return snapshot.docs.map(doc => createCleanFabricObject(doc.data()));
  } catch (error) {
    console.warn("Network fetch failed, attempting explicit cache fallback...", error);
    try {
        // If network failed completely (and SDK didn't auto-fallback), try forcing cache
        const cacheSnap = await getDocsFromCache(collection(db, COLLECTION_NAME));
        return cacheSnap.docs.map(doc => createCleanFabricObject(doc.data()));
    } catch (cacheErr) {
        console.error("Cache fetch also failed", cacheErr);
        // Return empty array so app doesn't crash, allowing UI to show "Empty/Error" state
        return [];
    }
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
  } catch (error) {
    console.error("Error writing document: ", error);
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