
import * as firebaseApp from "firebase/app";
import { 
  getFirestore,
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  deleteDoc, 
  writeBatch,
  initializeFirestore,
  persistentLocalCache,
  CACHE_SIZE_UNLIMITED,
  QuerySnapshot,
  DocumentData
} from "firebase/firestore";
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL
} from "firebase/storage";
import { 
  getAuth, 
  signInAnonymously,
  onAuthStateChanged,
  User,
  AuthError
} from "firebase/auth";
import { Fabric, FurnitureTemplate } from "../types";
import { FURNITURE_TEMPLATES as DEFAULT_FURNITURE } from "../constants";

// ==========================================
// CONFIGURACIÓN DE FIREBASE (NUBE)
// ==========================================

const firebaseConfig = {
  apiKey: "AIzaSyCEQTcNm4F3E-9qnHTcwqK91XXLyQa6Cws",
  authDomain: "telas-pruebas.firebaseapp.com",
  projectId: "telas-pruebas",
  storageBucket: "telas-pruebas.appspot.com", 
  messagingSenderId: "924889236456",
  appId: "1:924889236456:web:4f9abc86478b16170f5a5d",
  measurementId: "G-V098WS2ZWM"
};

// Variables de Estado
let isConnected = false; 
let authConfigMissing = false;
let lastAuthErrorMessage = ""; 

const app = firebaseApp.initializeApp(firebaseConfig);
const auth = getAuth(app);

// 1. ESTABILIDAD Y PERSISTENCIA (MODERNO)
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: undefined, 
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
  }),
  ignoreUndefinedProperties: true
});

const storage = getStorage(app);
const COLLECTION_NAME = "fabrics";
const FURNITURE_COLLECTION = "furniture";

// --- HELPER DE TIMEOUT ---
const withTimeout = <T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            setTimeout(() => {
                reject(new Error(errorMessage));
            }, ms);
        })
    ]);
};

// --- SISTEMA DE ESPERA DE AUTENTICACIÓN (CRÍTICO) ---
const waitForAuth = (): Promise<User | null> => {
    if (auth.currentUser) return Promise.resolve(auth.currentUser);

    const authPromise = new Promise<User | null>((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            if (user) {
                isConnected = true;
                resolve(user);
            } else {
                signInAnonymously(auth).then((cred) => {
                    isConnected = true;
                    resolve(cred.user);
                }).catch((e: AuthError) => {
                    console.warn("Auth Failed (Offline Mode):", e.code);
                    lastAuthErrorMessage = e.code || e.message;
                    if (e.code === 'auth/operation-not-allowed') authConfigMissing = true;
                    else if (e.code === 'auth/unauthorized-domain') lastAuthErrorMessage = "DOMAIN_ERROR";
                    resolve(null);
                });
            }
        });
    });

    // Reduced timeout to 5s for faster feedback
    return withTimeout(authPromise, 5000, "AUTH_TIMEOUT").catch(() => null);
};

onAuthStateChanged(auth, (user) => {
    isConnected = !!user;
});

// --- DIAGNÓSTICO DE PERMISOS ---
export const checkDatabasePermissions = async (): Promise<boolean> => {
    try {
        await waitForAuth();
        const testRef = doc(db, "_health_check", "permission_test");
        await withTimeout(setDoc(testRef, { status: "ok", ts: Date.now() }), 5000, "DB_TIMEOUT");
        return true; 
    } catch (error: any) {
        console.warn("Health Check Failed:", error.message);
        if (error.code === 'permission-denied') return false;
        // DB_TIMEOUT is common on slow/offline connections, treat as offline mode (return true to avoid blocking UI)
        return true; 
    }
};

// --- Helpers de Imágenes ---
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
    return new Blob([]);
  }
};

const uploadImageToStorage = async (base64String: string, path: string): Promise<string> => {
    if (!base64String || base64String.startsWith('http')) return base64String;
    
    await waitForAuth();

    try {
        const storageRef = ref(storage, path);
        const blob = dataURItoBlob(base64String);
        
        // Reduced timeout to 20s
        await withTimeout(
            uploadBytes(storageRef, blob), 
            20000, 
            "UPLOAD_TIMEOUT"
        );

        return await getDownloadURL(storageRef);
    } catch (error: any) {
        // Fallback to base64 if upload fails
        console.warn(`⚠️ Upload failed (${path}). Using local base64.`, error.message);
        return base64String;
    }
};

const processFabricImagesForCloud = async (fabric: Fabric): Promise<Fabric> => {
    const updatedFabric = { ...fabric };
    const timestamp = Date.now();
    const cleanId = fabric.id.replace(/[^a-zA-Z0-9]/g, '_');
    
    const promises = [];
    
    if (updatedFabric.mainImage?.startsWith('data:')) {
        promises.push((async () => updatedFabric.mainImage = await uploadImageToStorage(updatedFabric.mainImage, `fabrics/${cleanId}/main_${timestamp}.jpg`))());
    }
    if (updatedFabric.specsImage?.startsWith('data:')) {
        promises.push((async () => updatedFabric.specsImage = await uploadImageToStorage(updatedFabric.specsImage, `fabrics/${cleanId}/specs_${timestamp}.jpg`))());
    }
    if (updatedFabric.colorImages) {
        const newColors = { ...updatedFabric.colorImages };
        const colorEntries = Object.entries(updatedFabric.colorImages);
        for (const [k, v] of colorEntries) {
             if (v?.startsWith('data:')) {
                promises.push((async () => newColors[k] = await uploadImageToStorage(v, `fabrics/${cleanId}/colors/${k}_${timestamp}.jpg`))());
            }
        }
        promises.push(Promise.resolve().then(() => { updatedFabric.colorImages = newColors; }));
    }

    await Promise.all(promises);
    return updatedFabric;
};

// --- Helpers Locales (SMART BACKUP) ---
const saveToLocalBackup = (key: string, data: any) => {
    try { 
        localStorage.setItem(key, JSON.stringify(data)); 
    } catch (e: any) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            console.warn("⚠️ LocalStorage lleno. Guardando versión ligera.");
            const lightData = Array.isArray(data) ? data.map((item: any) => {
                const clean = { ...item };
                if (clean.mainImage?.startsWith('data:')) clean.mainImage = '';
                if (clean.specsImage?.startsWith('data:')) clean.specsImage = '';
                if (clean.imageUrl?.startsWith('data:')) clean.imageUrl = '';
                if (clean.colorImages) {
                    const newColors: any = {};
                    Object.keys(clean.colorImages).forEach(k => {
                        if (clean.colorImages[k]?.startsWith('http')) {
                            newColors[k] = clean.colorImages[k];
                        }
                    });
                    clean.colorImages = newColors;
                }
                return clean;
            }) : data;
            try { localStorage.setItem(key, JSON.stringify(lightData)); } catch (err) {}
        }
    }
};

export const getLocalCachedData = () => {
    const localFabrics = localStorage.getItem("creata_fabrics_offline_backup");
    const localFurniture = localStorage.getItem("creata_furniture_offline");
    return {
        fabrics: localFabrics ? JSON.parse(localFabrics) : [],
        furniture: localFurniture ? JSON.parse(localFurniture) : []
    };
};

export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  await waitForAuth();
  try {
    const querySnapshot = await withTimeout<QuerySnapshot<DocumentData>>(
        getDocs(collection(db, COLLECTION_NAME)), 
        5000, // Fast read timeout
        "READ_TIMEOUT"
    );
    const fabrics: Fabric[] = [];
    querySnapshot.forEach((doc) => fabrics.push(doc.data() as Fabric));
    if (fabrics.length > 0) {
        saveToLocalBackup("creata_fabrics_offline_backup", fabrics);
        return fabrics;
    }
  } catch (error: any) {
    console.warn("⚠️ Nube no disponible, usando caché local:", error.message);
  }
  const { fabrics } = getLocalCachedData();
  return fabrics;
};

export const saveFabricToFirestore = async (fabric: Fabric) => {
  // 1. Guardado Optimista (Local) - ALWAYS SUCCESS FIRST
  try {
      const { fabrics } = getLocalCachedData();
      const index = fabrics.findIndex((f: Fabric) => f.id === fabric.id);
      if (index >= 0) fabrics[index] = fabric;
      else fabrics.unshift(fabric);
      saveToLocalBackup("creata_fabrics_offline_backup", fabrics);
  } catch(e) { console.error("Local save failed", e); }

  // 2. Guardado en Nube (Mejor esfuerzo)
  try {
    const user = await waitForAuth();
    if (!user && !isOfflineMode()) {
        console.warn("Modo Offline forzado por fallo de auth.");
    }
    
    // Subir imágenes (fallback to local base64 if fails)
    const cloudFabric = await processFabricImagesForCloud(fabric);
    
    // Guardar JSON (5s timeout)
    await withTimeout(
        setDoc(doc(db, COLLECTION_NAME, cloudFabric.id), cloudFabric, { merge: true }),
        5000,
        "DB_WRITE_TIMEOUT"
    );
    return true;
  } catch (error: any) {
    console.warn("⚠️ Guardado solo en Local (Nube no disponible):", error.message);
    // DO NOT THROW. Return success because local save worked.
    return false; 
  }
};

export const saveBatchFabricsToFirestore = async (fabrics: Fabric[]) => {
  for (const f of fabrics) {
      await saveFabricToFirestore(f);
  }
};

export const deleteFabricFromFirestore = async (fabricId: string) => {
  const { fabrics } = getLocalCachedData();
  const filtered = fabrics.filter((f: Fabric) => f.id !== fabricId);
  saveToLocalBackup("creata_fabrics_offline_backup", filtered);
  try {
    await waitForAuth();
    await deleteDoc(doc(db, COLLECTION_NAME, fabricId));
  } catch (error) { console.error("Error delete cloud", error); }
};

export const getFurnitureTemplatesFromFirestore = async (): Promise<FurnitureTemplate[]> => {
    try {
        await waitForAuth();
        const querySnapshot = await withTimeout<QuerySnapshot<DocumentData>>(
            getDocs(collection(db, FURNITURE_COLLECTION)),
            5000,
            "READ_TIMEOUT"
        );
        const furniture: FurnitureTemplate[] = [];
        querySnapshot.forEach((doc) => furniture.push(doc.data() as FurnitureTemplate));
        if (furniture.length > 0) {
            saveToLocalBackup("creata_furniture_offline", furniture);
            return furniture;
        }
    } catch (error) {}
    const { furniture } = getLocalCachedData();
    return furniture.length > 0 ? furniture : DEFAULT_FURNITURE;
};

export const saveFurnitureTemplateToFirestore = async (template: FurnitureTemplate) => {
    try {
        const { furniture } = getLocalCachedData();
        const combined = furniture.length > 0 ? furniture : DEFAULT_FURNITURE;
        const index = combined.findIndex((t: FurnitureTemplate) => t.id === template.id);
        if (index >= 0) combined[index] = template;
        else combined.unshift(template);
        saveToLocalBackup("creata_furniture_offline", combined);
    } catch(e) {}

    try {
        await waitForAuth();
        let imageUrl = template.imageUrl;
        if (imageUrl.startsWith('data:')) {
            const timestamp = Date.now();
            const cleanId = template.id.replace(/[^a-zA-Z0-9]/g, '_');
            imageUrl = await uploadImageToStorage(imageUrl, `furniture/${cleanId}_${timestamp}.jpg`);
        }
        const finalTemplate = { ...template, imageUrl };
        await setDoc(doc(db, FURNITURE_COLLECTION, finalTemplate.id), finalTemplate, { merge: true });
        return finalTemplate;
    } catch (error) {
        return template;
    }
};

export const deleteFurnitureTemplateFromFirestore = async (id: string) => {
    const { furniture } = getLocalCachedData();
    const filtered = furniture.filter((t: FurnitureTemplate) => t.id !== id);
    saveToLocalBackup("creata_furniture_offline", filtered);
    try { await deleteDoc(doc(db, FURNITURE_COLLECTION, id)); } catch (e) {}
};

export const clearFirestoreCollection = async () => {
    localStorage.removeItem("creata_fabrics_offline_backup");
    try {
        await waitForAuth();
        const snapshot = await getDocs(collection(db, COLLECTION_NAME));
        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
    } catch(e) {}
};

export const pushLocalBackupToCloud = async (): Promise<number> => {
    const { fabrics } = getLocalCachedData();
    if (fabrics.length === 0) throw new Error("No hay datos locales.");
    
    await waitForAuth();
    for (const f of fabrics) {
        await saveFabricToFirestore(f);
    }
    return fabrics.length;
};

export const retryAuth = async () => {
    try {
        await signInAnonymously(auth);
        return true;
    } catch (e) { return false; }
};

export const isOfflineMode = () => !auth.currentUser; 
export const isAuthConfigMissing = () => authConfigMissing;
export const getAuthError = () => lastAuthErrorMessage;
