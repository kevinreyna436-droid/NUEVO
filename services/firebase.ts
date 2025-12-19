
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
             console.warn("FALTA ACTIVAR AUTHENTICATION EN CONSOLA");
        }
        globalOfflineMode = true;
    } finally {
        authResolve();
    }
};

// Iniciar al cargar
initAuth();

// Initialize Firestore
// Se usa enableIndexedDbPersistence posteriormente para evitar errores de exportación con la API nueva
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
});

// Habilitar Persistencia Offline (Legacy API compatible)
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('Persistencia falló: Multiples pestañas abiertas.');
    } else if (err.code == 'unimplemented') {
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
        console.warn("⚠️ Modo Offline: Guardando imagen localmente.");
        return base64String;
    }

    try {
        const storageRef = ref(storage, path);
        const blob = dataURItoBlob(base64String);
        if (blob.size === 0) return base64String;

        // Metadatos para caché del navegador (Cache-Control)
        const metadata = {
          cacheControl: 'public,max-age=31536000', // 1 año de caché
        };

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

// Permite reintentar la conexión manualmente desde la UI
export const retryAuth = async () => {
    console.log("🔄 Reintentando conexión...");
    await initAuth();
    return !authConfigMissing;
};

export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  // Esperar a que la autenticación termine antes de consultar
  await authReadyPromise;

  try {
    // getDocs usará caché primero si está disponible gracias a enableIndexedDbPersistence
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const fabrics: Fabric[] = [];
    
    querySnapshot.forEach((doc) => {
      fabrics.push(doc.data() as Fabric);
    });

    console.log(`☁️ Cargadas ${fabrics.length} telas (Sincronizado/Caché).`);
    globalOfflineMode = false;
    authConfigMissing = false;
    return fabrics;
  } catch (error: any) {
    console.error("❌ Error conectando a Firestore:", error.message);
    
    globalOfflineMode = true;
    const localData = localStorage.getItem("creata_fabrics_offline_backup");
    return localData ? JSON.parse(localData) : [];
  }
};

export const saveFabricToFirestore = async (fabric: Fabric) => {
  try {
    const cloudFabric = await processFabricImagesForCloud(fabric);
    await setDoc(doc(db, COLLECTION_NAME, cloudFabric.id), cloudFabric, { merge: true });
    
    console.log("✅ Tela guardada:", cloudFabric.name);

    // Backup local (Legacy)
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

// --- FURNITURE FUNCTIONS ---

export const getFurnitureTemplatesFromFirestore = async (): Promise<FurnitureTemplate[]> => {
    await authReadyPromise;
    try {
        const querySnapshot = await getDocs(collection(db, FURNITURE_COLLECTION));
        const furniture: FurnitureTemplate[] = [];
        querySnapshot.forEach((doc) => {
            furniture.push(doc.data() as FurnitureTemplate);
        });

        if (furniture.length === 0) {
            return DEFAULT_FURNITURE;
        }

        return furniture;
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

export const isOfflineMode = () => globalOfflineMode;
export const isAuthConfigMissing = () => authConfigMissing;
