import * as firebaseApp from "firebase/app";
import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  deleteDoc, 
  writeBatch,
  initializeFirestore,
  disableNetwork,
  setLogLevel,
  enableNetwork
} from "firebase/firestore";
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "firebase/storage";
import type { QuerySnapshot, DocumentData } from "firebase/firestore";
import { Fabric } from "../types";

// Suppress unnecessary connection warnings from Firebase SDK
setLogLevel('silent');

// LIVE CONFIG - Connected to creata-catalogo
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
// Use namespace import to avoid 'no exported member' errors in some environments
const app = firebaseApp.initializeApp(firebaseConfig);

// Initialize Firestore
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  experimentalAutoDetectLongPolling: true 
});

// Initialize Storage
const storage = getStorage(app);

const COLLECTION_NAME = "fabrics";
const LOCAL_STORAGE_KEY = "creata_fabrics_offline_backup";

// CLEANUP: Force remove any legacy blocking flags
try {
    localStorage.removeItem("creata_firestore_broken");
} catch(e) {}

// SESSION-ONLY OFFLINE MODE
// Default to FALSE (Online) to attempt connection to your cloud
let globalOfflineMode = false;

// --- Local Storage Helpers ---

const getLocalFabrics = (): Fabric[] => {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Error reading local storage", e);
    return [];
  }
};

const saveLocalFabric = (fabric: Fabric) => {
  try {
    const current = getLocalFabrics();
    const index = current.findIndex(f => f.id === fabric.id);
    if (index >= 0) {
      current[index] = fabric;
    } else {
      current.unshift(fabric);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn("Could not save to local storage due to quota limits.");
  }
};

const deleteLocalFabric = (id: string) => {
  try {
    const current = getLocalFabrics();
    const filtered = current.filter(f => f.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error("Error deleting from local storage", e);
  }
};

const clearLocalFabrics = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
};

// --- Utils ---

const dataURItoBlob = (dataURI: string): Blob => {
  try {
    if (!dataURI || !dataURI.includes(',')) return new Blob([]);
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

const uploadImageToStorage = async (base64String: string, path: string): Promise<string> => {
    // If we are strictly offline, skip upload
    if (globalOfflineMode) return base64String;

    try {
        if (base64String.startsWith('http')) return base64String;
        
        const storageRef = ref(storage, path);
        const blob = dataURItoBlob(base64String);
        
        if (blob.size === 0) return base64String;

        await uploadBytes(storageRef, blob);
        const downloadURL = await getDownloadURL(storageRef);
        return downloadURL;
    } catch (error) {
        console.warn("Image upload failed:", error);
        // Fallback: Return original base64 so at least it saves locally/temporarily
        return base64String;
    }
};

const processFabricImagesForStorage = async (fabric: Fabric): Promise<Fabric> => {
    const updatedFabric = { ...fabric };
    // Skip image processing in offline mode (saves as base64 locally)
    if (globalOfflineMode) return updatedFabric;

    const timestamp = Date.now();

    try {
        if (updatedFabric.mainImage && updatedFabric.mainImage.startsWith('data:')) {
            const path = `fabrics/${updatedFabric.id}/main_${timestamp}.jpg`;
            updatedFabric.mainImage = await uploadImageToStorage(updatedFabric.mainImage, path);
        }

        if (updatedFabric.specsImage && updatedFabric.specsImage.startsWith('data:')) {
            const path = `fabrics/${updatedFabric.id}/specs_${timestamp}.jpg`;
            updatedFabric.specsImage = await uploadImageToStorage(updatedFabric.specsImage, path);
        }

        if (updatedFabric.colorImages) {
            const newColorImages: Record<string, string> = {};
            for (const [colorName, base64] of Object.entries(updatedFabric.colorImages)) {
                if (base64 && base64.startsWith('data:')) {
                    const safeColorName = colorName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const path = `fabrics/${updatedFabric.id}/colors/${safeColorName}_${timestamp}.jpg`;
                    newColorImages[colorName] = await uploadImageToStorage(base64, path);
                } else {
                    newColorImages[colorName] = base64;
                }
            }
            updatedFabric.colorImages = newColorImages;
        }
    } catch (e) {
        console.warn("Image processing encountered issues", e);
    }

    return updatedFabric;
};

const createCleanFabricObject = (source: any): Fabric => {
  if (!source || typeof source !== 'object') {
      return {
          id: 'error-' + Date.now(),
          name: 'Error',
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

// --- Exported Operations ---

// Attempt to re-enable network if we were offline
const ensureOnline = async () => {
    // If we are forced offline by config, do not attempt to connect
    if (globalOfflineMode) return;

    try {
        await enableNetwork(db);
        console.log("Network enabled.");
    } catch (e) {
        // console.warn("Could not enable network:", e);
    }
};

export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  // Always fetch local data first as a base/fallback
  const localData = getLocalFabrics();

  // Return local only if we are in disconnected mode
  if (globalOfflineMode) return localData;

  try {
    // Increased timeout to 15s for better initial load on slow networks
    const serverPromise = getDocs(collection(db, COLLECTION_NAME));
    const timeoutPromise = new Promise<QuerySnapshot<DocumentData>>((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT_CONNECT')), 15000)
    );

    const snapshot = await Promise.race([serverPromise, timeoutPromise]);
    
    const cloudFabrics = snapshot.docs.map(doc => createCleanFabricObject(doc.data()));

    // HYBRID MERGE STRATEGY:
    // We combine Cloud data with Local data. 
    // If an ID exists in both, Cloud takes precedence (usually more up to date if sync works).
    // If Cloud fails to save but Local saved, this ensures the item still appears.
    const fabricMap = new Map<string, Fabric>();
    
    // 1. Populate with local first
    localData.forEach(f => fabricMap.set(f.id, f));
    
    // 2. Overwrite/Add with Cloud data
    cloudFabrics.forEach(f => fabricMap.set(f.id, f));

    return Array.from(fabricMap.values());

  } catch (error: any) {
    console.warn("Firestore connection failed. Returning local data.", error?.message);
    
    // Only switch to permanent offline mode if it's a hard network error
    if (error?.code === 'unavailable' || error?.message === 'TIMEOUT_CONNECT') {
        globalOfflineMode = true;
        try { await disableNetwork(db); } catch(e) {}
    }
    
    return localData;
  }
};

export const saveFabricToFirestore = async (fabric: Fabric) => {
  // Always try to connect before saving to ensure cloud sync
  await ensureOnline();

  // 0. Save locally IMMEDIATELY as a backup before attempting anything complex
  saveLocalFabric(fabric);

  let fabricToSave = { ...fabric };
  
  // 1. Process Images (Upload to Storage) - skipped in offline mode
  try {
    fabricToSave = await processFabricImagesForStorage(fabric);
  } catch (error) {
    console.error("Image processing failed, saving with base64/partial data.", error);
  }

  // If offline, stop here (we already saved locally)
  if (globalOfflineMode) {
      console.log("✅ Saved to local storage (Offline Mode)");
      return;
  }

  // 2. Save Document to Cloud
  try {
    const cleanFabric = createCleanFabricObject(fabricToSave);
    if (!cleanFabric.id) throw new Error("Invalid ID");
    
    const savePromise = setDoc(doc(db, COLLECTION_NAME, cleanFabric.id), cleanFabric, { merge: true });
    // Increased timeout for save operations
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_SAVE')), 15000));
    
    await Promise.race([savePromise, timeoutPromise]);
    console.log("✅ Saved to cloud successfully");
    
  } catch (error: any) {
    console.warn("Firestore save failed. Data preserved in LocalStorage.", error);
    // Ensure the version with processed images (if any succeeded) is saved locally
    saveLocalFabric(fabricToSave); 
  }
};

export const saveBatchFabricsToFirestore = async (fabrics: Fabric[]) => {
  // Backup all locally first
  fabrics.forEach(f => saveLocalFabric(f));

  await ensureOnline();
  
  if (globalOfflineMode) {
      console.log("✅ Batch saved to local storage (Offline Mode)");
      return;
  }

  const BATCH_SIZE = 400;
  const chunks = [];
  
  for (let i = 0; i < fabrics.length; i += BATCH_SIZE) {
      chunks.push(fabrics.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const fabric of chunk) {
           const cleanFabric = createCleanFabricObject(fabric);
           const ref = doc(db, COLLECTION_NAME, cleanFabric.id);
           batch.set(ref, cleanFabric, { merge: true });
      }
      try {
          await batch.commit();
          console.log(`Saved batch of ${chunk.length} fabrics to cloud.`);
      } catch (e) {
          console.error("Batch save failed", e);
          // Already saved locally at start of function
      }
  }
};

export const deleteFabricFromFirestore = async (fabricId: string) => {
  await ensureOnline();

  // Delete locally first for instant UI feedback
  deleteLocalFabric(fabricId);

  if (globalOfflineMode) return;

  try {
    await deleteDoc(doc(db, COLLECTION_NAME, fabricId));
  } catch (error) {
    console.warn("Cloud delete failed, but deleted locally.", error);
  }
};

export const clearFirestoreCollection = async () => {
  localStorage.removeItem(LOCAL_STORAGE_KEY);
  await ensureOnline();

  if (globalOfflineMode) return;

  try {
    const snap = await getDocs(collection(db, COLLECTION_NAME));
    const batch = writeBatch(db);
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  } catch (error) {
    // Ignore error
  }
};

export const isOfflineMode = () => globalOfflineMode;