
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
  enableIndexedDbPersistence,
  QuerySnapshot,
  DocumentData,
  CACHE_SIZE_UNLIMITED
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
  onAuthStateChanged
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
  storageBucket: "telas-pruebas.firebasestorage.app",
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

// 1. MEJORA DE ESTABILIDAD: Usar Long Polling en lugar de WebSockets
// Esto evita desconexiones en redes móviles o corporativas.
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  experimentalForceLongPolling: true, // <--- CLAVE PARA ESTABILIDAD
  cacheSizeBytes: CACHE_SIZE_UNLIMITED
});

// Habilitar caché offline de Firestore (Diferente al LocalStorage)
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Persistencia falló: Multiples pestañas abiertas.');
    } else if (err.code === 'unimplemented') {
        console.warn('El navegador no soporta persistencia.');
    }
});

const storage = getStorage(app);
const COLLECTION_NAME = "fabrics";
const FURNITURE_COLLECTION = "furniture";

// --- HELPER DE TIMEOUT ---
const withTimeout = <T>(promise: Promise<T>, ms: number, fallbackValue?: T): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((resolve, reject) => {
            setTimeout(() => {
                if (fallbackValue !== undefined) {
                    console.warn(`⏳ Timeout (${ms}ms).`);
                    resolve(fallbackValue);
                } else {
                    reject(new Error("Timeout"));
                }
            }, ms);
        })
    ]);
};

// 2. SISTEMA DE AUTENTICACIÓN ROBUSTO
// En lugar de solo iniciar sesión una vez, escuchamos el estado.
const initAuthListener = () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("🟢 Usuario Conectado (Listener):", user.uid);
            isConnected = true;
        } else {
            console.log("🔴 Usuario Desconectado. Reintentando...");
            isConnected = false;
            signInAnonymously(auth).catch((e) => console.error("Auto-reconnect failed", e));
        }
    });
};

// Iniciar sesión inicial
const initAuth = async () => {
    try {
        await signInAnonymously(auth);
        isConnected = true;
        authConfigMissing = false;
    } catch (error: any) {
        console.error("🔥 Error Auth Inicial:", error.code);
        lastAuthErrorMessage = error.message;
        isConnected = false;
        
        if (error.code === 'auth/configuration-not-found' || error.code === 'auth/operation-not-allowed') {
             authConfigMissing = true;
        }
    }
    initAuthListener(); // Activar el escucha permanente
};

initAuth();

// --- Helpers de Errores ---
const handlePermissionError = () => {
    console.error("❌ PERMISO DENEGADO: Verifica reglas de Firestore.");
};

export const checkDatabasePermissions = async (): Promise<boolean> => {
    try {
        const testRef = doc(db, "_health_check", "permission_test");
        await withTimeout(setDoc(testRef, { status: "ok", ts: Date.now() }), 4000);
        return true; 
    } catch (error: any) {
        if (error.code === 'permission-denied') return false;
        return true; // Si es timeout, asumimos que sí tiene permisos pero es lento
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

    // Si no hay conexión real, devolvemos base64 para que la UI no se rompa
    if (!auth.currentUser) return base64String;

    try {
        const storageRef = ref(storage, path);
        const blob = dataURItoBlob(base64String);
        
        // Timeout de 15s para subidas (más generoso)
        const uploadTask = uploadBytes(storageRef, blob);
        const snapshot = await withTimeout(uploadTask, 15000, 'TIMEOUT');

        if (snapshot === 'TIMEOUT') return base64String;

        return await getDownloadURL(storageRef);
    } catch (error: any) {
        console.warn(`Fallo subida imagen (Usando local):`, error.code);
        return base64String;
    }
};

const processFabricImagesForCloud = async (fabric: Fabric): Promise<Fabric> => {
    const updatedFabric = { ...fabric };
    const timestamp = Date.now();
    const cleanId = fabric.id.replace(/[^a-zA-Z0-9]/g, '_');
    
    // Procesamos imágenes en paralelo
    const promises = [];
    
    if (updatedFabric.mainImage?.startsWith('data:')) {
        promises.push((async () => updatedFabric.mainImage = await uploadImageToStorage(updatedFabric.mainImage, `fabrics/${cleanId}/main_${timestamp}.jpg`))());
    }
    if (updatedFabric.specsImage?.startsWith('data:')) {
        promises.push((async () => updatedFabric.specsImage = await uploadImageToStorage(updatedFabric.specsImage, `fabrics/${cleanId}/specs_${timestamp}.jpg`))());
    }
    if (updatedFabric.colorImages) {
        const newColors = { ...updatedFabric.colorImages };
        Object.entries(updatedFabric.colorImages).forEach(([k, v]) => {
            if (v?.startsWith('data:')) {
                promises.push((async () => newColors[k] = await uploadImageToStorage(v, `fabrics/${cleanId}/colors/${k}_${timestamp}.jpg`))());
            }
        });
        updatedFabric.colorImages = newColors;
    }

    await Promise.all(promises);
    return updatedFabric;
};

// --- Helpers Locales ---
const saveToLocalBackup = (key: string, data: any) => {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
};

export const getLocalCachedData = () => {
    const localFabrics = localStorage.getItem("creata_fabrics_offline_backup");
    const localFurniture = localStorage.getItem("creata_furniture_offline");
    return {
        fabrics: localFabrics ? JSON.parse(localFabrics) : [],
        furniture: localFurniture ? JSON.parse(localFurniture) : []
    };
};

// --- FUNCIONES PRINCIPALES ---

export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  // 1. Intentamos leer de la Nube (o caché inteligente de Firestore)
  try {
    // Timeout de 6s. Si falla, cae al catch y devuelve lo local
    const querySnapshot = await withTimeout<QuerySnapshot<DocumentData>>(
        getDocs(collection(db, COLLECTION_NAME)), 
        6000
    );
    
    const fabrics: Fabric[] = [];
    querySnapshot.forEach((doc) => fabrics.push(doc.data() as Fabric));
    
    if (fabrics.length > 0) {
        console.log(`☁️ Nube: ${fabrics.length} telas cargadas.`);
        saveToLocalBackup("creata_fabrics_offline_backup", fabrics);
        return fabrics;
    }
  } catch (error: any) {
    console.warn("⚠️ Falló lectura de nube, usando datos locales:", error.message);
    if (error.code === 'permission-denied') handlePermissionError();
  }

  // 2. Si falla la nube, devolvemos LocalStorage inmediatamente
  const { fabrics } = getLocalCachedData();
  return fabrics;
};

export const saveFabricToFirestore = async (fabric: Fabric) => {
  // 1. Guardado Optimista (Local)
  try {
      const { fabrics } = getLocalCachedData();
      const index = fabrics.findIndex((f: Fabric) => f.id === fabric.id);
      if (index >= 0) fabrics[index] = fabric;
      else fabrics.unshift(fabric);
      saveToLocalBackup("creata_fabrics_offline_backup", fabrics);
  } catch(e) {}

  // 2. Guardado en Nube (Sin bloquear UI si falla)
  try {
    // Si no estamos conectados, intentamos reconectar rápido
    if (!auth.currentUser) await signInAnonymously(auth);

    const cloudFabric = await processFabricImagesForCloud(fabric);
    
    // Timeout de 10s para guardar el documento
    await withTimeout(
        setDoc(doc(db, COLLECTION_NAME, cloudFabric.id), cloudFabric, { merge: true }), 
        10000
    );
    
  } catch (error: any) {
    console.error("❌ Error guardando en nube (Guardado local OK):", error.message);
  }
};

export const saveBatchFabricsToFirestore = async (fabrics: Fabric[]) => {
  for (const f of fabrics) {
      await saveFabricToFirestore(f);
  }
};

export const deleteFabricFromFirestore = async (fabricId: string) => {
  // Local Delete
  const { fabrics } = getLocalCachedData();
  const filtered = fabrics.filter((f: Fabric) => f.id !== fabricId);
  saveToLocalBackup("creata_fabrics_offline_backup", filtered);

  // Cloud Delete
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, fabricId));
  } catch (error) { console.error("Error delete cloud", error); }
};

export const getFurnitureTemplatesFromFirestore = async (): Promise<FurnitureTemplate[]> => {
    try {
        const querySnapshot = await withTimeout<QuerySnapshot<DocumentData>>(
            getDocs(collection(db, FURNITURE_COLLECTION)), 
            5000
        );
        const furniture: FurnitureTemplate[] = [];
        querySnapshot.forEach((doc) => furniture.push(doc.data() as FurnitureTemplate));
        
        if (furniture.length > 0) {
            saveToLocalBackup("creata_furniture_offline", furniture);
            return furniture;
        }
    } catch (error) {}

    // Fallback Local
    const { furniture } = getLocalCachedData();
    return furniture.length > 0 ? furniture : DEFAULT_FURNITURE;
};

export const saveFurnitureTemplateToFirestore = async (template: FurnitureTemplate) => {
    // Local
    try {
        const { furniture } = getLocalCachedData();
        const combined = furniture.length > 0 ? furniture : DEFAULT_FURNITURE;
        const index = combined.findIndex((t: FurnitureTemplate) => t.id === template.id);
        if (index >= 0) combined[index] = template;
        else combined.unshift(template);
        saveToLocalBackup("creata_furniture_offline", combined);
    } catch(e) {}

    // Cloud
    try {
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
        const snapshot = await getDocs(collection(db, COLLECTION_NAME));
        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
    } catch(e) {}
};

export const pushLocalBackupToCloud = async (): Promise<number> => {
    const { fabrics } = getLocalCachedData();
    if (fabrics.length === 0) throw new Error("No hay datos locales.");
    
    // Forzar reconexión antes de subir
    if (!auth.currentUser) await signInAnonymously(auth);

    console.log(`🚀 Subiendo backup (${fabrics.length} telas)...`);
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

export const isOfflineMode = () => !auth.currentUser; // Simplificado: si hay usuario, asumimos online
export const isAuthConfigMissing = () => authConfigMissing;
export const getAuthError = () => lastAuthErrorMessage;
