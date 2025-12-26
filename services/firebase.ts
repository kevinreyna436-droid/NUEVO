
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
// CONFIGURACIÓN DE FIREBASE (PRODUCCIÓN)
// ==========================================

// Credenciales proporcionadas por el usuario (telas-pruebas)
const defaultConfig = {
  apiKey: "AIzaSyCEQTcNm4F3E-9qnHTcwqK91XXLyQa6Cws",
  authDomain: "telas-pruebas.firebaseapp.com",
  projectId: "telas-pruebas",
  storageBucket: "telas-pruebas.firebasestorage.app",
  messagingSenderId: "924889236456",
  appId: "1:924889236456:web:4f9abc86478b16170f5a5d",
  measurementId: "G-V098WS2ZWM"
};

// LIMPIEZA AUTOMÁTICA DE CONFIGURACIÓN ANTIGUA
try {
    const savedConfig = localStorage.getItem('creata_firebase_config');
    if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (defaultConfig.projectId === "telas-pruebas") {
            localStorage.removeItem('creata_firebase_config');
        }
    }
} catch(e) {}

let firebaseConfig = defaultConfig;
let isCustomConfig = false;

try {
  const localConfig = localStorage.getItem('creata_firebase_config');
  if (localConfig) {
    const parsed = JSON.parse(localConfig);
    if (parsed.apiKey && parsed.projectId) {
      firebaseConfig = parsed;
      isCustomConfig = true;
    }
  }
} catch (e) {
  console.error("Error cargando config local", e);
}

// Variables de Estado
let isConnected = false; 
let authConfigMissing = false;
let lastAuthErrorMessage = ""; 

// Inicializar App
let app;
let auth: any;
let db: any;
let storage: any;

try {
    app = firebaseApp.getApps().length === 0 ? firebaseApp.initializeApp(firebaseConfig) : firebaseApp.getApps()[0];
    auth = getAuth(app);
    
    // 1. ESTABILIDAD Y PERSISTENCIA
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: undefined, 
        cacheSizeBytes: CACHE_SIZE_UNLIMITED
      }),
      ignoreUndefinedProperties: true
    });

    storage = getStorage(app);
} catch (error: any) {
    console.error("Firebase Init Error:", error);
    if (isCustomConfig) {
        localStorage.removeItem('creata_firebase_config');
        window.location.reload();
    }
}

const COLLECTION_NAME = "fabrics";
const FURNITURE_COLLECTION = "furniture";

// --- HELPER DE TIMEOUT (AUMENTADO A 15s para redes lentas) ---
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
    if (!auth) return Promise.resolve(null);
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
                    console.warn("Auth Failed:", e.code);
                    lastAuthErrorMessage = e.code || e.message;
                    if (e.code === 'auth/operation-not-allowed') authConfigMissing = true;
                    else if (e.code === 'auth/unauthorized-domain') lastAuthErrorMessage = "DOMAIN_ERROR";
                    else if (e.code === 'auth/api-key-not-valid.-please-pass-a-valid-api-key.') lastAuthErrorMessage = "INVALID_API_KEY";
                    resolve(null);
                });
            }
        });
    });

    // Timeout aumentado a 8s para dar tiempo a la conexión inicial
    return withTimeout(authPromise, 8000, "AUTH_TIMEOUT").catch(() => null);
};

if (auth) {
    onAuthStateChanged(auth, (user) => {
        isConnected = !!user;
    });
}

// --- DIAGNÓSTICO DE PERMISOS ---
export const checkDatabasePermissions = async (): Promise<boolean> => {
    try {
        await waitForAuth();
        const testRef = doc(db, "_health_check", "permission_test");
        // Timeout generoso para el check de salud
        await withTimeout(setDoc(testRef, { status: "ok", ts: Date.now() }), 8000, "DB_TIMEOUT");
        return true; 
    } catch (error: any) {
        console.warn("Health Check Failed:", error.message);
        if (error.code === 'permission-denied') return false;
        // Si es timeout, asumimos que puede ser red lenta, no necesariamente bloqueo
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
        
        await withTimeout(
            uploadBytes(storageRef, blob), 
            60000, // 60s timeout para subidas de imágenes
            "UPLOAD_TIMEOUT"
        );

        return await getDownloadURL(storageRef);
    } catch (error: any) {
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
        10000, // Timeout AUMENTADO A 10 SEGUNDOS para lectura inicial
        "READ_TIMEOUT"
    );
    const fabrics: Fabric[] = [];
    querySnapshot.forEach((doc) => fabrics.push(doc.data() as Fabric));
    
    // Solo actualizamos caché si la nube nos dio algo válido
    if (fabrics.length > 0) {
        saveToLocalBackup("creata_fabrics_offline_backup", fabrics);
        return fabrics;
    } else {
        // Si la nube devuelve 0 items (colección vacía), devolvemos array vacío pero NO fallback a caché antiguo
        // (Asumimos que es una DB nueva)
        return [];
    }
  } catch (error: any) {
    console.warn("⚠️ Nube no disponible, usando caché local:", error.message);
  }
  
  // Fallback si hay error de conexión
  const { fabrics } = getLocalCachedData();
  return fabrics;
};

export const saveFabricToFirestore = async (fabric: Fabric) => {
  try {
      const { fabrics } = getLocalCachedData();
      const index = fabrics.findIndex((f: Fabric) => f.id === fabric.id);
      if (index >= 0) fabrics[index] = fabric;
      else fabrics.unshift(fabric);
      saveToLocalBackup("creata_fabrics_offline_backup", fabrics);
  } catch(e) { console.error("Local save failed", e); }

  try {
    const user = await waitForAuth();
    if (!user && !isOfflineMode()) {
        throw new Error("No hay usuario autenticado.");
    }
    
    const cloudFabric = await processFabricImagesForCloud(fabric);
    
    await withTimeout(
        setDoc(doc(db, COLLECTION_NAME, cloudFabric.id), cloudFabric, { merge: true }),
        20000, // Timeout escritura aumentado
        "DB_WRITE_TIMEOUT"
    );
    return true;
  } catch (error: any) {
    console.warn("⚠️ Guardado solo en Local:", error.message);
    return false;
  }
};

export const saveBatchFabricsToFirestore = async (fabrics: Fabric[]) => {
  for (const f of fabrics) { await saveFabricToFirestore(f); }
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
            8000, // Timeout aumentado
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
        const combined = furniture.length > 0 ? furniture : [...DEFAULT_FURNITURE];
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
    } catch (error) { return template; }
};

export const deleteFurnitureTemplateFromFirestore = async (id: string) => {
    try {
        const { furniture } = getLocalCachedData();
        const currentList = furniture.length > 0 ? furniture : [...DEFAULT_FURNITURE];
        const updated = currentList.filter((t: FurnitureTemplate) => t.id !== id);
        saveToLocalBackup("creata_furniture_offline", updated);
    } catch(e) {}

    try {
        await waitForAuth();
        await deleteDoc(doc(db, FURNITURE_COLLECTION, id));
    } catch (error) { console.error("Error deleting furniture:", error); }
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
    for (const f of fabrics) { await saveFabricToFirestore(f); }
    return fabrics.length;
};

export const retryAuth = async () => {
    if (!auth) return false;
    try { await signInAnonymously(auth); return true; } catch (e) { return false; }
};

export const isOfflineMode = () => !auth || !auth.currentUser; 
export const isAuthConfigMissing = () => authConfigMissing;
export const getAuthError = () => lastAuthErrorMessage;
export const isUsingCustomConfig = () => isCustomConfig;
