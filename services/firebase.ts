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

const firebaseConfig = {
  apiKey: "AIzaSyAudyiExH_syO9MdtSzn4cDxrK0p1zjnac",
  authDomain: "creata-catalogo.firebaseapp.com",
  projectId: "creata-catalogo",
  storageBucket: "creata-catalogo.firebasestorage.app",
  messagingSenderId: "667237641772",
  appId: "1:667237641772:web:50a3ce92c5839d49cfab89",
  measurementId: "G-RH13X81KLF"
};

// Initialize Firebase
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

// CLEANUP: Force remove any legacy blocking flags from previous versions
try {
    localStorage.removeItem("creata_firestore_broken");
} catch(e) {}

// SESSION-ONLY OFFLINE MODE
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
        return base64String;
    }
};

const processFabricImagesForStorage = async (fabric: Fabric): Promise<Fabric> => {
    if (globalOfflineMode) return fabric;

    const updatedFabric = { ...fabric };
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
        console.warn("Image upload failed, falling back to local images");
        return fabric;
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

// --- Exported Operations with Fallback ---

export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  // If we already failed in this session, don't try again until reload
  if (globalOfflineMode) {
      return getLocalFabrics();
  }

  try {
    // Attempt connection with a longer timeout (12s) to ensure cold starts work
    const serverPromise = getDocs(collection(db, COLLECTION_NAME));
    const timeoutPromise = new Promise<QuerySnapshot<DocumentData>>((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT_CONNECT')), 12000)
    );

    const snapshot = await Promise.race([serverPromise, timeoutPromise]);
    return snapshot.docs.map(doc => createCleanFabricObject(doc.data()));

  } catch (error: any) {
    console.warn("Firestore connection failed. Switching to Session Offline Mode.", error?.message);
    
    // Switch to offline mode ONLY for this session
    globalOfflineMode = true;
    
    // We disable the network to stop the SDK from spamming console errors for THIS session only
    try { await disableNetwork(db); } catch(e) {}
    
    return getLocalFabrics();
  }
};

export const saveFabricToFirestore = async (fabric: Fabric) => {
  let fabricToSave = { ...fabric };
  
  if (globalOfflineMode) {
      saveLocalFabric(fabricToSave);
      return;
  }

  try {
    fabricToSave = await processFabricImagesForStorage(fabric);
  } catch (error) {
    // Keep base64 if storage fails
  }

  try {
    const cleanFabric = createCleanFabricObject(fabricToSave);
    if (!cleanFabric.id) throw new Error("Invalid ID");
    
    const savePromise = setDoc(doc(db, COLLECTION_NAME, cleanFabric.id), cleanFabric, { merge: true });
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_SAVE')), 5000));
    
    await Promise.race([savePromise, timeoutPromise]);
    
  } catch (error: any) {
    console.warn("Firestore save failed, saving to LocalStorage.");
    saveLocalFabric(fabricToSave); 
  }
};

export const saveBatchFabricsToFirestore = async (fabrics: Fabric[]) => {
  if (globalOfflineMode) {
      fabrics.forEach(f => saveLocalFabric(f));
      return;
  }
  
  // Use WriteBatch for speed and efficiency
  // Firestore limit is 500 ops per batch
  const BATCH_SIZE = 400;
  const chunks = [];
  
  for (let i = 0; i < fabrics.length; i += BATCH_SIZE) {
      chunks.push(fabrics.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const fabric of chunk) {
           // We do minimal image processing for batch initial uploads to avoid timeouts
           // Assumes these are static text records or already processed
           const cleanFabric = createCleanFabricObject(fabric);
           const ref = doc(db, COLLECTION_NAME, cleanFabric.id);
           batch.set(ref, cleanFabric, { merge: true });
      }
      try {
          await batch.commit();
          console.log(`Saved batch of ${chunk.length} fabrics.`);
      } catch (e) {
          console.error("Batch save failed", e);
          // Fallback to local
          chunk.forEach(f => saveLocalFabric(f));
      }
  }
};

export const deleteFabricFromFirestore = async (fabricId: string) => {
  if (globalOfflineMode) {
      deleteLocalFabric(fabricId);
      return;
  }

  try {
    await deleteDoc(doc(db, COLLECTION_NAME, fabricId));
  } catch (error) {
    deleteLocalFabric(fabricId);
  }
};

export const clearFirestoreCollection = async () => {
  localStorage.removeItem(LOCAL_STORAGE_KEY);
  
  // If manual clear, try to re-enable network in case they want to retry
  if (globalOfflineMode) {
      globalOfflineMode = false;
      try { await enableNetwork(db); } catch(e) {}
  }

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
