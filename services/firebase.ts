import { initializeApp } from "firebase/app";
import { 
  collection, 
  getDocs, 
  getDocsFromCache,
  setDoc, 
  doc, 
  deleteDoc, 
  writeBatch,
  initializeFirestore
} from "firebase/firestore";
import type { QuerySnapshot, DocumentData } from "firebase/firestore";
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

// Initialize Firestore with default settings to avoid connectivity issues
// Removed CACHE_SIZE_UNLIMITED and enableIndexedDbPersistence to prevent "Backend didn't respond" errors
const db = initializeFirestore(app, {});

const COLLECTION_NAME = "fabrics";

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Creates a clean, plain Javascript object strictly adhering to the Fabric interface.
 * Enforces strict size limits to prevent Firestore crashes.
 */
const createCleanFabricObject = (source: any): Fabric => {
  // 1. Basic Object Structure
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

  const safeString = (val: any): string => {
      try {
          if (val === null || val === undefined) return '';
          if (typeof val === 'string') return val;
          if (typeof val === 'number') return String(val);
          if (typeof val === 'boolean') return String(val);
          return ''; 
      } catch (e) { return ''; }
  };

  // 2. Extract Basic Data
  const baseData = {
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
    colors: Array.isArray(source.colors) ? source.colors.map(safeString).filter((s: string) => s) : [],
    pdfUrl: safeString(source.pdfUrl),
    category: source.category === 'wood' ? 'wood' as const : 'model' as const,
    mainImage: safeString(source.mainImage)
  };

  // 3. SIZE BUDGET LOGIC
  // Firestore limit is 1,048,576 bytes. We aim for < 950,000 bytes safe zone.
  const MAX_BYTES = 950000;
  
  // Calculate size of everything except colorImages
  let currentSize = JSON.stringify(baseData).length;

  const cleanColorImages: Record<string, string> = {};

  if (source.colorImages && typeof source.colorImages === 'object') {
      try {
          const entries = Object.entries(source.colorImages);
          // Prioritize adding images in order
          for (const [k, v] of entries) {
              const key = safeString(k);
              const val = safeString(v);
              
              if (!key || !val) continue;

              // Individual image hard limit (Increased to 800KB to allow for new 1024px images)
              // This still relies on MAX_BYTES to stop the total doc from exploding.
              if (val.length > 800000) {
                  console.warn(`Skipping large image for color ${key} (${val.length} bytes)`);
                  continue;
              }

              // Overhead estimation for JSON key/value pair chars
              const entrySize = key.length + val.length + 8; 

              if (currentSize + entrySize < MAX_BYTES) {
                  cleanColorImages[key] = val;
                  currentSize += entrySize;
              } else {
                  console.warn(`Doc size limit reached. Dropping image for: ${key}`);
              }
          }
      } catch(e) { console.warn("Error processing colorImages map"); }
  }

  return {
    ...baseData,
    colorImages: cleanColorImages
  };
};

/**
 * Retries an async operation with exponential backoff.
 */
const retryOperation = async <T>(operation: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> => {
    try {
        return await operation();
    } catch (error: any) {
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

export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  try {
    // Attempt to fetch from server first
    const serverPromise = getDocs(collection(db, COLLECTION_NAME));
    
    // Create a timeout to fallback to cache/empty if network is too slow
    const timeoutPromise = new Promise<QuerySnapshot<DocumentData>>((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT_SLOW_NETWORK')), 5000)
    );

    let snapshot: QuerySnapshot<DocumentData>;

    try {
        snapshot = await Promise.race([serverPromise, timeoutPromise]);
    } catch (raceError: any) {
        console.warn("Network slow or unreachable. Switching to fallback.");
        try {
            // Explicitly try cache if server failed
            snapshot = await getDocsFromCache(collection(db, COLLECTION_NAME));
        } catch (cacheError) {
             console.warn("Cache also unavailable.");
             return [];
        }
    }
    
    return snapshot.docs.map(doc => createCleanFabricObject(doc.data()));
  } catch (error: any) {
    console.error("Error in getFabricsFromFirestore", error?.message || "Unknown");
    return [];
  }
};

export const saveFabricToFirestore = async (fabric: Fabric) => {
  try {
    const cleanFabric = createCleanFabricObject(fabric);
    if (!cleanFabric.id) throw new Error("Invalid ID");
    await retryOperation(() => setDoc(doc(db, COLLECTION_NAME, cleanFabric.id), cleanFabric, { merge: true }));
  } catch (error: any) {
    console.error("Error writing document", error?.message || 'Unknown write error'); 
    throw error;
  }
};

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
        throw new Error("Error al guardar lote.");
    }
  }
};

export const deleteFabricFromFirestore = async (fabricId: string) => {
  try {
    await retryOperation(() => deleteDoc(doc(db, COLLECTION_NAME, fabricId)));
  } catch (error: any) {
    console.error("Error deleting document", error?.message || 'Unknown delete error');
    throw error;
  }
};

export const clearFirestoreCollection = async () => {
  try {
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