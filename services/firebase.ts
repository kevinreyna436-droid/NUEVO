import * as firebaseApp from "firebase/app";
import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  deleteDoc, 
  writeBatch,
  initializeFirestore,
  disableNetwork
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
const app = firebaseApp.initializeApp(firebaseConfig);

// Initialize Firestore
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
});

// Initialize Storage
const storage = getStorage(app);

const COLLECTION_NAME = "fabrics";
const LOCAL_STORAGE_KEY = "creata_fabrics_offline_backup";

// CIRCUIT BREAKER: If backend fails once (e.g. DB missing), stay offline for session.
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
    console.error("Local storage error (Quota exceeded?)", e);
    // Silent fail or minimal alert to avoid disrupting UI
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
    // Optimization: If we already know backend is dead, skip upload attempts
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
        // If upload fails, we likely have connectivity/config issues.
        // We propagate error so the caller can switch to offline mode if needed,
        // or just fallback to base64.
        throw error;
    }
};

const processFabricImagesForStorage = async (fabric: Fabric): Promise<Fabric> => {
    const updatedFabric = { ...fabric };
    const timestamp = Date.now();

    // 1. Upload Main Image
    if (updatedFabric.mainImage && updatedFabric.mainImage.startsWith('data:')) {
        const path = `fabrics/${updatedFabric.id}/main_${timestamp}.jpg`;
        updatedFabric.mainImage = await uploadImageToStorage(updatedFabric.mainImage, path);
    }

    // 2. Upload Specs Image
    if (updatedFabric.specsImage && updatedFabric.specsImage.startsWith('data:')) {
        const path = `fabrics/${updatedFabric.id}/specs_${timestamp}.jpg`;
        updatedFabric.specsImage = await uploadImageToStorage(updatedFabric.specsImage, path);
    }

    // 3. Upload Color Images
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
  // 1. Immediate circuit breaker
  if (globalOfflineMode) {
      console.log("Offline mode active: Returning local data.");
      return getLocalFabrics();
  }

  try {
    // 2. Attempt with short timeout to detect "offline" or "db missing"
    // Reduced timeout to 2s for better UX
    const serverPromise = getDocs(collection(db, COLLECTION_NAME));
    const timeoutPromise = new Promise<QuerySnapshot<DocumentData>>((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT_CONNECT')), 2000)
    );

    const snapshot = await Promise.race([serverPromise, timeoutPromise]);
    return snapshot.docs.map(doc => createCleanFabricObject(doc.data()));

  } catch (error: any) {
    const msg = error.code || error.message || '';
    console.warn("Backend unavailable (activating Offline Mode):", msg);
    
    // 3. Activate Circuit Breaker
    globalOfflineMode = true;

    // 4. Disable Network explicitly to silence future SDK errors
    try {
        await disableNetwork(db);
    } catch (e) {
        console.warn("Could not disable network:", e);
    }
    
    // 5. Return Fallback
    return getLocalFabrics();
  }
};

export const saveFabricToFirestore = async (fabric: Fabric) => {
  let fabricToSave = { ...fabric };
  
  // If we know we are offline, skip straight to local
  if (globalOfflineMode) {
      saveLocalFabric(fabricToSave);
      return;
  }

  // 1. Try Image Upload
  try {
    fabricToSave = await processFabricImagesForStorage(fabric);
  } catch (error) {
    console.warn("Storage upload failed, keeping base64 images.");
    // We continue with fabricToSave containing base64 data
  }

  // 2. Try Firestore Save
  try {
    const cleanFabric = createCleanFabricObject(fabricToSave);
    if (!cleanFabric.id) throw new Error("Invalid ID");
    
    const savePromise = setDoc(doc(db, COLLECTION_NAME, cleanFabric.id), cleanFabric, { merge: true });
    // Short timeout for save attempts too
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_SAVE')), 3000));
    
    await Promise.race([savePromise, timeoutPromise]);
    
  } catch (error: any) {
    console.warn("Firestore save failed, saving to LocalStorage.");
    globalOfflineMode = true; // Trip circuit breaker on save fail too
    
    // Disable network to prevent retry noise
    try { await disableNetwork(db); } catch(e) {}
    
    saveLocalFabric(fabricToSave); 
  }
};

export const saveBatchFabricsToFirestore = async (fabrics: Fabric[]) => {
  // If offline, just loop local saves
  if (globalOfflineMode) {
      fabrics.forEach(f => saveLocalFabric(f));
      return;
  }
  
  for (const fabric of fabrics) {
      await saveFabricToFirestore(fabric);
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
    console.warn("Firestore delete failed, deleting from LocalStorage.");
    globalOfflineMode = true;
    try { await disableNetwork(db); } catch(e) {}
    deleteLocalFabric(fabricId);
  }
};

export const clearFirestoreCollection = async () => {
  if (globalOfflineMode) {
      clearLocalFabrics();
      return;
  }

  try {
    const snap = await getDocs(collection(db, COLLECTION_NAME));
    const batch = writeBatch(db);
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  } catch (error) {
    console.warn("Firestore clear failed, clearing LocalStorage.");
    globalOfflineMode = true;
    try { await disableNetwork(db); } catch(e) {}
    clearLocalFabrics();
  }
};
