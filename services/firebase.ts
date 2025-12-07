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
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "firebase/storage";
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

// Initialize Firestore
const db = initializeFirestore(app, {});

// Initialize Storage
const storage = getStorage(app);

const COLLECTION_NAME = "fabrics";

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Converts a Base64 Data URI to a Blob
 */
const dataURItoBlob = (dataURI: string): Blob => {
  try {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  } catch (e) {
    console.error("Error converting dataURI to blob", e);
    return new Blob([]);
  }
};

/**
 * Uploads a Base64 image to Firebase Storage and returns the Public URL.
 * Uses uploadBytes for better performance and stability with large files.
 */
const uploadImageToStorage = async (base64String: string, path: string): Promise<string> => {
    try {
        // If it's already a URL (http...), just return it.
        if (base64String.startsWith('http')) return base64String;
        
        const storageRef = ref(storage, path);
        const blob = dataURItoBlob(base64String);
        
        if (blob.size === 0) return base64String; // Failed conversion fallback

        await uploadBytes(storageRef, blob);
        const downloadURL = await getDownloadURL(storageRef);
        return downloadURL;
    } catch (error) {
        console.error("Error uploading to storage:", error);
        // Throwing allows the retry logic in saveFabricToFirestore to handle it or fail gracefully
        throw error;
    }
};

/**
 * Iterates through a Fabric object, uploads all Base64 images to Storage,
 * and returns a new Fabric object with URLs instead of Base64.
 */
const processFabricImagesForStorage = async (fabric: Fabric): Promise<Fabric> => {
    const updatedFabric = { ...fabric };
    const timestamp = Date.now();

    // 1. Upload Main Image
    if (updatedFabric.mainImage && updatedFabric.mainImage.startsWith('data:')) {
        const path = `fabrics/${updatedFabric.id}/main_${timestamp}.jpg`;
        try {
            updatedFabric.mainImage = await uploadImageToStorage(updatedFabric.mainImage, path);
        } catch (e) {
            console.warn("Failed to upload main image, skipping...");
        }
    }

    // 2. Upload Specs Image
    if (updatedFabric.specsImage && updatedFabric.specsImage.startsWith('data:')) {
        const path = `fabrics/${updatedFabric.id}/specs_${timestamp}.jpg`;
        try {
            updatedFabric.specsImage = await uploadImageToStorage(updatedFabric.specsImage, path);
        } catch (e) {
             console.warn("Failed to upload specs image, skipping...");
        }
    }

    // 3. Upload Color Images
    if (updatedFabric.colorImages) {
        const newColorImages: Record<string, string> = {};
        for (const [colorName, base64] of Object.entries(updatedFabric.colorImages)) {
            if (base64 && base64.startsWith('data:')) {
                // Sanitize color name for filename
                const safeColorName = colorName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const path = `fabrics/${updatedFabric.id}/colors/${safeColorName}_${timestamp}.jpg`;
                try {
                    newColorImages[colorName] = await uploadImageToStorage(base64, path);
                } catch (e) {
                    console.warn(`Failed to upload color ${colorName}, skipping...`);
                    newColorImages[colorName] = base64; // Keep base64 if fail, though it might fail Firestore
                }
            } else {
                newColorImages[colorName] = base64;
            }
        }
        updatedFabric.colorImages = newColorImages;
    }

    return updatedFabric;
};

/**
 * Creates a clean object. Now that we use Storage, we don't need aggressive size checks,
 * but we keep basic sanitization.
 */
const createCleanFabricObject = (source: any): Fabric => {
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
          return String(val);
      } catch (e) { return ''; }
  };

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
    colors: Array.isArray(source.colors) ? source.colors.map(safeString).filter((s: string) => s) : [],
    colorImages: source.colorImages || {},
    pdfUrl: safeString(source.pdfUrl),
    specsImage: safeString(source.specsImage),
    customCatalog: safeString(source.customCatalog),
    category: source.category === 'wood' ? 'wood' as const : 'model' as const,
    mainImage: safeString(source.mainImage)
  };
};

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
            await delay(delayMs);
            return retryOperation(operation, retries - 1, delayMs * 2);
        }
        throw error;
    }
};

// --- Firestore Operations ---

export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  try {
    const serverPromise = getDocs(collection(db, COLLECTION_NAME));
    const timeoutPromise = new Promise<QuerySnapshot<DocumentData>>((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT_SLOW_NETWORK')), 15000) // Increased timeout for reading
    );

    let snapshot: QuerySnapshot<DocumentData>;
    try {
        snapshot = await Promise.race([serverPromise, timeoutPromise]);
    } catch (raceError) {
        try {
            snapshot = await getDocsFromCache(collection(db, COLLECTION_NAME));
        } catch (cacheError) {
             return [];
        }
    }
    return snapshot.docs.map(doc => createCleanFabricObject(doc.data()));
  } catch (error) {
    console.error("Error getting fabrics", error);
    return [];
  }
};

export const saveFabricToFirestore = async (fabric: Fabric) => {
  try {
    // 1. Upload images to Storage first (High Quality)
    const storedFabric = await processFabricImagesForStorage(fabric);
    
    // 2. Clean object (metadata only)
    const cleanFabric = createCleanFabricObject(storedFabric);
    
    // 3. Save to Firestore (now lightweight because images are URLs)
    if (!cleanFabric.id) throw new Error("Invalid ID");
    await retryOperation(() => setDoc(doc(db, COLLECTION_NAME, cleanFabric.id), cleanFabric, { merge: true }));
  } catch (error) {
    console.error("Error writing document", error); 
    throw error;
  }
};

export const saveBatchFabricsToFirestore = async (fabrics: Fabric[]) => {
  // We can process these sequentially to ensure storage uploads succeed
  for (const fabric of fabrics) {
      await saveFabricToFirestore(fabric);
  }
};

export const deleteFabricFromFirestore = async (fabricId: string) => {
  try {
    await retryOperation(() => deleteDoc(doc(db, COLLECTION_NAME, fabricId)));
  } catch (error) {
    console.error("Error deleting document", error);
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
  } catch (error) {
    console.error("Error clearing collection", error);
    throw error;
  }
};