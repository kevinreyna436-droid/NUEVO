
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

const firebaseConfig = {
  apiKey: "AIzaSyCzdQwkC--MboeRXeq8DjzyJkIfZoITKro",
  authDomain: "proyecto-1-23086.firebaseapp.com",
  projectId: "proyecto-1-23086",
  storageBucket: "proyecto-1-23086.firebasestorage.app",
  messagingSenderId: "521750292128",
  appId: "1:521750292128:web:aeef06815de16e67564bc5",
  measurementId: "G-QG3JVEL7F5"
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
        console.log("✅ Conexión a Nube (Auth) exitosa.");
        globalOfflineMode = false;
        authConfigMissing = false;
    } catch (error: any) {
        const errorCode = error.code;
        console.error("🔥 Error Auth:", errorCode);
        
        if (errorCode === 'auth/configuration-not-found' || errorCode === 'auth/operation-not-allowed') {
             authConfigMissing = true;
             alert("⚠️ ERROR DE CONFIGURACIÓN FIREBASE: Debes habilitar 'Anonymous Auth' (Autenticación Anónima) en la consola de Firebase para que la app pueda leer tus fotos.");
        } else if (errorCode === 'auth/api-key-not-valid') {
             alert("⚠️ ERROR API KEY: La API Key de Firebase no es válida. Revisa tu configuración.");
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

// Habilitar Persistencia Offline
enableIndexedDbPersistence(db).catch((err) => {
    console.warn('Persistencia offline:', err.code);
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

export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  await authReadyPromise;

  try {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const fabrics: Fabric[] = [];
    
    querySnapshot.forEach((doc) => {
      fabrics.push(doc.data() as Fabric);
    });

    console.log(`☁️ Cargadas ${fabrics.length} telas.`);
    globalOfflineMode = false;
    authConfigMissing = false;
    return fabrics;
  } catch (error: any) {
    console.error("❌ Error conectando a Firestore:", error.code, error.message);
    
    // Alerta Específica para Permisos
    if (error.code === 'permission-denied') {
        alert("⚠️ ACCESO DENEGADO A LA NUBE: Tus reglas de seguridad de Firestore impiden la lectura. Revisa la pestaña 'Rules' en Firestore Console.");
    }
    
    globalOfflineMode = true;
    const localData = localStorage.getItem("creata_fabrics_offline_backup");
    return localData ? JSON.parse(localData) : [];
  }
};

export const saveFabricToFirestore = async (fabric: Fabric) => {
  try {
    const cloudFabric = await processFabricImagesForCloud(fabric);
    await setDoc(doc(db, COLLECTION_NAME, cloudFabric.id), cloudFabric, { merge: true });
    
    try {
        const currentLocal = localStorage.getItem("creata_fabrics_offline_backup");
        const parsed = currentLocal ? JSON.parse(currentLocal) : [];
        const index = parsed.findIndex((f: Fabric) => f.id === cloudFabric.id);
        if (index >= 0) parsed[index] = cloudFabric;
        else parsed.unshift(cloudFabric);
        localStorage.setItem("creata_fabrics_offline_backup", JSON.stringify(parsed));
    } catch(e) {}

  } catch (error: any) {
    console.error("❌ Error guardando:", error);
    if (error.code === 'permission-denied') {
        alert("No se pudo guardar: Permisos denegados en la nube.");
    }
    throw error;
  }
};

export const saveBatchFabricsToFirestore = async (fabrics: Fabric[]) => {
  for (const fabric of fabrics) {
      await saveFabricToFirestore(fabric);
  }
};

export const deleteFabricFromFirestore = async (fabricId: string) => {
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, fabricId));
    
    const currentLocal = localStorage.getItem("creata_fabrics_offline_backup");
    if (currentLocal) {
        const parsed = JSON.parse(currentLocal);
        const filtered = parsed.filter((f: Fabric) => f.id !== fabricId);
        localStorage.setItem("creata_fabrics_offline_backup", JSON.stringify(filtered));
    }
  } catch (error) {
    console.error("Error eliminando doc:", error);
    throw error;
  }
};

export const getFurnitureTemplatesFromFirestore = async (): Promise<FurnitureTemplate[]> => {
    await authReadyPromise;
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
        console.error("Error saving furniture:", error);
        throw error;
    }
};

export const deleteFurnitureTemplateFromFirestore = async (id: string) => {
    try {
        await deleteDoc(doc(db, FURNITURE_COLLECTION, id));
    } catch (error) {
        console.error("Error deleting furniture:", error);
        throw error;
    }
};

export const clearFirestoreCollection = async () => {
    const snapshot = await getDocs(collection(db, COLLECTION_NAME));
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();
    localStorage.removeItem("creata_fabrics_offline_backup");
};

/**
 * UTILITY: Push Local Storage Backup to Cloud manually.
 * Used when user transitions from Permission Denied -> Permission Granted.
 */
export const pushLocalBackupToCloud = async (): Promise<number> => {
    const localData = localStorage.getItem("creata_fabrics_offline_backup");
    if (!localData) throw new Error("No hay datos locales guardados en este navegador.");
    
    let parsed: Fabric[] = [];
    try {
        parsed = JSON.parse(localData);
    } catch (e) {
        throw new Error("El respaldo local está corrupto.");
    }

    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("El respaldo local está vacío.");

    console.log(`🚀 Iniciando rescate de ${parsed.length} telas...`);
    
    // Upload one by one to ensure images get processed
    for (const fabric of parsed) {
        await saveFabricToFirestore(fabric);
    }
    
    return parsed.length;
};

export const isOfflineMode = () => globalOfflineMode;
export const isAuthConfigMissing = () => authConfigMissing;
