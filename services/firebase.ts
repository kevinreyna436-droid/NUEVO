
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
  enableIndexedDbPersistence
} from "firebase/firestore";
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL
} from "firebase/storage";
import { 
  getAuth, 
  signInAnonymously
} from "firebase/auth";
import { Fabric, FurnitureTemplate } from "../types";
import { FURNITURE_TEMPLATES as DEFAULT_FURNITURE } from "../constants";

// ==========================================
// CONFIGURACIÓN DE FIREBASE (NUBE)
// ==========================================

// ACTUALIZADO: Conectado a 'telas-pruebas'
const firebaseConfig = {
  apiKey: "AIzaSyCEQTcNm4F3E-9qnHTcwqK91XXLyQa6Cws",
  authDomain: "telas-pruebas.firebaseapp.com",
  projectId: "telas-pruebas",
  storageBucket: "telas-pruebas.firebasestorage.app",
  messagingSenderId: "924889236456",
  appId: "1:924889236456:web:4f9abc86478b16170f5a5d",
  measurementId: "G-V098WS2ZWM"
};

// Estado de conexión global
let globalOfflineMode = false;
let authConfigMissing = false;

// Promesa para esperar a que la auth termine (éxito o fallo) antes de pedir datos
let authResolve: (value: void | PromiseLike<void>) => void;
const authReadyPromise = new Promise<void>((resolve) => {
    authResolve = resolve;
});

// Initialize Firebase
const app = firebaseApp.initializeApp(firebaseConfig);
const auth = getAuth(app);

// Función para iniciar sesión
const initAuth = async () => {
    try {
        await signInAnonymously(auth);
        console.log("✅ Conexión a Nube (Auth) exitosa: telas-pruebas");
        globalOfflineMode = false;
        authConfigMissing = false;
    } catch (error: any) {
        const errorCode = error.code;
        console.error("🔥 Error Auth (Entrando en modo Offline):", errorCode);
        
        // Si la Key es inválida, no molestamos al usuario con alertas, solo activamos offline
        if (errorCode === 'auth/api-key-not-valid') {
             console.warn("⚠️ API Key inválida. Se usará almacenamiento local.");
        } else if (errorCode === 'auth/configuration-not-found' || errorCode === 'auth/operation-not-allowed') {
             authConfigMissing = true;
        }
        
        globalOfflineMode = true;
    } finally {
        authResolve();
    }
};

// Iniciar al cargar
initAuth();

// Initialize Firestore
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
});

// CORRECCIÓN CRÍTICA: La persistencia debe activarse INMEDIATAMENTE, sin setTimeout.
// Si falla (por ej. offline mode extremo o navegador no compatible), lo capturamos y seguimos.
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
    console.error("Error converting dataURI to blob", e);
    return new Blob([]);
  }
};

const uploadImageToStorage = async (base64String: string, path: string): Promise<string> => {
    if (!base64String) return '';
    if (base64String.startsWith('http')) return base64String;

    if (globalOfflineMode) {
        return base64String;
    }

    try {
        const storageRef = ref(storage, path);
        const blob = dataURItoBlob(base64String);
        if (blob.size === 0) return base64String;

        const metadata = { cacheControl: 'public,max-age=31536000' };
        await uploadBytes(storageRef, blob, metadata);
        return await getDownloadURL(storageRef);
    } catch (error: any) {
        console.warn(`Fallo al subir imagen ${path}:`, error.message);
        return base64String;
    }
};

const processFabricImagesForCloud = async (fabric: Fabric): Promise<Fabric> => {
    const updatedFabric = { ...fabric };
    // Si estamos offline, no intentamos subir imágenes, devolvemos el objeto tal cual
    if (globalOfflineMode) return updatedFabric;

    const timestamp = Date.now();
    const cleanId = fabric.id.replace(/[^a-zA-Z0-9]/g, '_');

    if (updatedFabric.mainImage && updatedFabric.mainImage.startsWith('data:')) {
        updatedFabric.mainImage = await uploadImageToStorage(updatedFabric.mainImage, `fabrics/${cleanId}/main_${timestamp}.jpg`);
    }

    if (updatedFabric.specsImage && updatedFabric.specsImage.startsWith('data:')) {
        updatedFabric.specsImage = await uploadImageToStorage(updatedFabric.specsImage, `fabrics/${cleanId}/specs_${timestamp}.jpg`);
    }

    if (updatedFabric.colorImages) {
        const newColorImages: Record<string, string> = {};
        for (const [colorName, base64] of Object.entries(updatedFabric.colorImages)) {
            if (base64 && base64.startsWith('data:')) {
                const safeColorName = colorName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                newColorImages[colorName] = await uploadImageToStorage(base64, `fabrics/${cleanId}/colors/${safeColorName}_${timestamp}.jpg`);
            } else {
                newColorImages[colorName] = base64;
            }
        }
        updatedFabric.colorImages = newColorImages;
    }

    return updatedFabric;
};

// --- Funciones Exportadas ---

export const retryAuth = async () => {
    await initAuth();
    return !authConfigMissing;
};

// HELPER: Guardar en LocalStorage (Backup)
const saveToLocalBackup = (key: string, data: any) => {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error("Error guardando en LocalStorage (Quota exceeded?)", e);
    }
};

export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  await authReadyPromise;

  // MODO OFFLINE IMPERATIVO: Si la auth falló, ni siquiera tocamos Firestore
  if (globalOfflineMode) {
      console.log("⚡ Modo Offline activado: Leyendo telas locales.");
      const localData = localStorage.getItem("creata_fabrics_offline_backup");
      return localData ? JSON.parse(localData) : [];
  }

  try {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const fabrics: Fabric[] = [];
    
    querySnapshot.forEach((doc) => {
      fabrics.push(doc.data() as Fabric);
    });

    return fabrics;
  } catch (error: any) {
    console.error("❌ Error Firestore:", error.code);
    globalOfflineMode = true; // Fallback inmediato
    const localData = localStorage.getItem("creata_fabrics_offline_backup");
    return localData ? JSON.parse(localData) : [];
  }
};

export const saveFabricToFirestore = async (fabric: Fabric) => {
  // Siempre actualizamos el local storage primero
  try {
      const currentLocal = localStorage.getItem("creata_fabrics_offline_backup");
      const parsed = currentLocal ? JSON.parse(currentLocal) : [];
      const index = parsed.findIndex((f: Fabric) => f.id === fabric.id);
      if (index >= 0) parsed[index] = fabric;
      else parsed.unshift(fabric);
      saveToLocalBackup("creata_fabrics_offline_backup", parsed);
  } catch(e) {}

  if (globalOfflineMode) return; // Si estamos offline, terminamos aquí (ya se guardó en local)

  try {
    const cloudFabric = await processFabricImagesForCloud(fabric);
    await setDoc(doc(db, COLLECTION_NAME, cloudFabric.id), cloudFabric, { merge: true });
  } catch (error: any) {
    console.error("Error guardando en nube (se guardó en local):", error);
  }
};

export const saveBatchFabricsToFirestore = async (fabrics: Fabric[]) => {
  for (const fabric of fabrics) {
      await saveFabricToFirestore(fabric);
  }
};

export const deleteFabricFromFirestore = async (fabricId: string) => {
  // Borrar de local
  const currentLocal = localStorage.getItem("creata_fabrics_offline_backup");
  if (currentLocal) {
      const parsed = JSON.parse(currentLocal);
      const filtered = parsed.filter((f: Fabric) => f.id !== fabricId);
      saveToLocalBackup("creata_fabrics_offline_backup", filtered);
  }

  if (globalOfflineMode) return;

  try {
    await deleteDoc(doc(db, COLLECTION_NAME, fabricId));
  } catch (error) {
    console.error("Error eliminando doc de nube:", error);
  }
};

export const getFurnitureTemplatesFromFirestore = async (): Promise<FurnitureTemplate[]> => {
    await authReadyPromise;
    
    // Mismo patrón offline para muebles
    if (globalOfflineMode) {
         const localData = localStorage.getItem("creata_furniture_offline");
         return localData ? JSON.parse(localData) : DEFAULT_FURNITURE;
    }

    try {
        const querySnapshot = await getDocs(collection(db, FURNITURE_COLLECTION));
        const furniture: FurnitureTemplate[] = [];
        querySnapshot.forEach((doc) => {
            furniture.push(doc.data() as FurnitureTemplate);
        });
        return furniture.length === 0 ? DEFAULT_FURNITURE : furniture;
    } catch (error) {
        console.error("Error fetching furniture:", error);
        return DEFAULT_FURNITURE;
    }
};

export const saveFurnitureTemplateToFirestore = async (template: FurnitureTemplate) => {
    // Guardar Local
    try {
        const currentLocal = localStorage.getItem("creata_furniture_offline") || JSON.stringify(DEFAULT_FURNITURE);
        const parsed = JSON.parse(currentLocal);
        const index = parsed.findIndex((t: FurnitureTemplate) => t.id === template.id);
        if (index >= 0) parsed[index] = template;
        else parsed.unshift(template);
        saveToLocalBackup("creata_furniture_offline", parsed);
    } catch(e) {}

    if (globalOfflineMode) return template;

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
        console.error("Error saving furniture to cloud:", error);
        return template;
    }
};

export const deleteFurnitureTemplateFromFirestore = async (id: string) => {
    // Borrar Local
    const currentLocal = localStorage.getItem("creata_furniture_offline");
    if (currentLocal) {
        const parsed = JSON.parse(currentLocal);
        const filtered = parsed.filter((t: FurnitureTemplate) => t.id !== id);
        saveToLocalBackup("creata_furniture_offline", filtered);
    }

    if (globalOfflineMode) return;

    try {
        await deleteDoc(doc(db, FURNITURE_COLLECTION, id));
    } catch (error) {
        console.error("Error deleting furniture from cloud:", error);
    }
};

export const clearFirestoreCollection = async () => {
    if (globalOfflineMode) {
        localStorage.removeItem("creata_fabrics_offline_backup");
        return;
    }
    const snapshot = await getDocs(collection(db, COLLECTION_NAME));
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();
    localStorage.removeItem("creata_fabrics_offline_backup");
};

export const pushLocalBackupToCloud = async (): Promise<number> => {
    // Si la key sigue siendo inválida, esta función fallará, pero el usuario ya sabe que está offline.
    // Solo intentamos si NO estamos en offline forzado (o el usuario intenta reconectar)
    const localData = localStorage.getItem("creata_fabrics_offline_backup");
    if (!localData) throw new Error("No hay datos locales.");
    
    let parsed: Fabric[] = [];
    try {
        parsed = JSON.parse(localData);
    } catch (e) {
        throw new Error("Datos corruptos.");
    }

    // Force re-auth check before pushing
    await initAuth();
    if (globalOfflineMode) {
        throw new Error("No se pudo conectar a la nube. Verifica tu API Key o conexión.");
    }

    console.log(`🚀 Subiendo ${parsed.length} telas...`);
    for (const fabric of parsed) {
        await saveFabricToFirestore(fabric);
    }
    return parsed.length;
};

export const isOfflineMode = () => globalOfflineMode;
export const isAuthConfigMissing = () => authConfigMissing;
