
import { initializeApp } from "firebase/app";
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
  getDownloadURL,
  uploadString,
  deleteObject
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
let lastConnectionError = ""; 

// Promesa para esperar a que la auth termine
let authResolve: (value: void | PromiseLike<void>) => void;
const authReadyPromise = new Promise<void>((resolve) => {
    authResolve = resolve;
});

// Initialize Firebase
let app: any;
let auth: any;
let db: any;
let storage: any;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    
    // Initialize Firestore
    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true
    });

    // Habilitar Persistencia Offline (si el navegador lo soporta)
    try {
        enableIndexedDbPersistence(db).catch(() => {});
    } catch (e) {}

    storage = getStorage(app);
} catch (e: any) {
    console.warn("Firebase SDK Init: Fallback to offline mode.");
    globalOfflineMode = true;
    lastConnectionError = e.message || "Error inicializando SDK";
}

// Función para iniciar sesión
const initAuth = async () => {
    if (globalOfflineMode) {
        if (authResolve) authResolve();
        return;
    }

    try {
        await signInAnonymously(auth);
        console.log("✅ Conexión a Nube (Auth) exitosa.");
        globalOfflineMode = false;
        authConfigMissing = false;
        lastConnectionError = "";
    } catch (error: any) {
        const errorCode = error.code;
        lastConnectionError = error.message || errorCode;
        
        if (errorCode === 'auth/api-key-not-valid') {
             console.warn("⚠️ API Key de Firebase no válida. Pasando a OFFLINE.");
        } else if (errorCode === 'auth/configuration-not-found' || errorCode === 'auth/operation-not-allowed') {
             authConfigMissing = true;
             console.warn("⚠️ Auth Anónimo no habilitado. Pasando a OFFLINE.");
        } else {
             console.warn(`⚠️ Error de conexión Firebase (${errorCode}). Pasando a OFFLINE.`);
        }
        
        globalOfflineMode = true;
    } finally {
        if (authResolve) authResolve();
    }
};

// Iniciar al cargar
initAuth();

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
    if (globalOfflineMode) return base64String;

    try {
        const storageRef = ref(storage, path);
        const blob = dataURItoBlob(base64String);
        if (blob.size === 0) return base64String;

        const metadata = { cacheControl: 'public,max-age=31536000' };
        await uploadBytes(storageRef, blob, metadata);
        return await getDownloadURL(storageRef);
    } catch (error: any) {
        return base64String;
    }
};

const processFabricImagesForCloud = async (fabric: Fabric): Promise<Fabric> => {
    if (globalOfflineMode) return fabric;

    const updatedFabric = { ...fabric };
    const timestamp = Date.now();
    const cleanId = fabric.id.replace(/[^a-zA-Z0-9]/g, '_');

    try {
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
    } catch (e) {
        console.warn("Error procesando imágenes para nube, guardando localmente.");
        return fabric;
    }

    return updatedFabric;
};

// --- Funciones Exportadas ---

export const currentProjectId = firebaseConfig.projectId;

export const retryAuth = async () => {
    await initAuth();
    return !authConfigMissing;
};

export const diagnoseConnection = async (): Promise<string> => {
    try {
        await authReadyPromise;
        
        if (globalOfflineMode) {
             let errorMsg = lastConnectionError;
             if (authConfigMissing) errorMsg = "Auth Anónimo no habilitado en Firebase Console.";
             
             return `⚠️ ESTADO: DESCONECTADO (OFFLINE)\n\n` +
                    `La app NO puede conectar con '${firebaseConfig.projectId}'.\n` +
                    `Causa Probable: ${errorMsg}\n\n` +
                    `SOLUCIONES:\n` +
                    `1. Activa 'Anonymous' en Auth -> Sign-in method.\n` +
                    `2. Revisa que las Reglas de Firestore permitan escribir.\n`;
        }

        const user = getAuth().currentUser;
        if (!user) return "❌ Error Crítico: No se pudo iniciar sesión anónima. Revisa la consola de Firebase.";
        
        // 1. CREAR BLOQUE DE PRUEBA VISIBLE (DB Test)
        try {
            // Creamos un ID único con la hora para que lo veas
            const testId = `prueba_conexion_${new Date().toLocaleTimeString().replace(/:/g, '-')}`;
            const testDocRef = doc(db, '_health_check', testId);
            
            await setDoc(testDocRef, { 
                status: 'CONEXIÓN EXITOSA', 
                mensaje: 'Si lees esto, tu base de datos funciona perfectamente.',
                timestamp: new Date(), 
                usuario: user.uid 
            });
            
            // NO BORRAMOS el documento para que el usuario pueda verlo en la consola
            // await deleteDoc(testDocRef);
        } catch (e: any) {
            if (e.code === 'permission-denied') return "❌ ERROR PERMISOS BASE DE DATOS\n\nVe a Firebase Console -> Firestore Database -> Reglas\nY pon: allow read, write: if true;";
            throw e;
        }

        // 2. Test Storage Write (Imágenes)
        try {
            const storageRef = ref(storage, '_health_check/test.txt');
            await uploadString(storageRef, 'connection_test_string');
            await deleteObject(storageRef);
        } catch (e: any) {
             if (e.code === 'storage/unauthorized') return "❌ ERROR PERMISOS FOTOS (STORAGE)\n\nVe a Firebase Console -> Storage -> Reglas\nY pon: allow read, write: if true;";
             return `❌ ERROR STORAGE: ${e.message}`;
        }

        // 3. Test Lectura
        const snapshot = await getDocs(collection(db, COLLECTION_NAME));
        
        return `✅ CONEXIÓN EXITOSA\n\n` +
               `He creado un bloque nuevo en tu base de datos llamado '_health_check'.\n` +
               `¡Ve a la consola de Firebase y búscalo para confirmar!\n\n` +
               `☁️ Proyecto: ${firebaseConfig.projectId}\n` +
               `📂 Telas guardadas: ${snapshot.size}`;
    } catch (e: any) {
        return `⚠️ ERROR DE CONEXIÓN\n\nDetalle: ${e.message}`;
    }
};

export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  await authReadyPromise;

  if (globalOfflineMode) {
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
    globalOfflineMode = true;
    const localData = localStorage.getItem("creata_fabrics_offline_backup");
    return localData ? JSON.parse(localData) : [];
  }
};

export const saveFabricToFirestore = async (fabric: Fabric) => {
  try {
    const currentLocal = localStorage.getItem("creata_fabrics_offline_backup");
    const parsed = currentLocal ? JSON.parse(currentLocal) : [];
    const index = parsed.findIndex((f: Fabric) => f.id === fabric.id);
    if (index >= 0) parsed[index] = fabric;
    else parsed.unshift(fabric);
    localStorage.setItem("creata_fabrics_offline_backup", JSON.stringify(parsed));
  } catch(e) {}

  if (globalOfflineMode) return;

  try {
    const cloudFabric = await processFabricImagesForCloud(fabric);
    await setDoc(doc(db, COLLECTION_NAME, cloudFabric.id), cloudFabric, { merge: true });
  } catch (error: any) {
    console.warn("No se pudo guardar en la nube.");
  }
};

export const saveBatchFabricsToFirestore = async (fabrics: Fabric[]) => {
  for (const fabric of fabrics) {
      await saveFabricToFirestore(fabric);
  }
};

export const deleteFabricFromFirestore = async (fabricId: string) => {
  try {
    const currentLocal = localStorage.getItem("creata_fabrics_offline_backup");
    if (currentLocal) {
        const parsed = JSON.parse(currentLocal);
        const filtered = parsed.filter((f: Fabric) => f.id !== fabricId);
        localStorage.setItem("creata_fabrics_offline_backup", JSON.stringify(filtered));
    }
  } catch (error) {}

  if (globalOfflineMode) return;

  try {
    await deleteDoc(doc(db, COLLECTION_NAME, fabricId));
  } catch (error) {}
};

export const getFurnitureTemplatesFromFirestore = async (): Promise<FurnitureTemplate[]> => {
    await authReadyPromise;
    if (globalOfflineMode) return DEFAULT_FURNITURE;

    try {
        const querySnapshot = await getDocs(collection(db, FURNITURE_COLLECTION));
        const furniture: FurnitureTemplate[] = [];
        querySnapshot.forEach((doc) => {
            furniture.push(doc.data() as FurnitureTemplate);
        });
        return furniture.length === 0 ? DEFAULT_FURNITURE : furniture;
    } catch (error) {
        return DEFAULT_FURNITURE;
    }
};

export const saveFurnitureTemplateToFirestore = async (template: FurnitureTemplate) => {
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
        return template;
    }
};

export const deleteFurnitureTemplateFromFirestore = async (id: string) => {
    if (globalOfflineMode) return;
    try {
        await deleteDoc(doc(db, FURNITURE_COLLECTION, id));
    } catch (error) {}
};

export const clearFirestoreCollection = async () => {
    localStorage.removeItem("creata_fabrics_offline_backup");
    if (globalOfflineMode) return;

    try {
        const snapshot = await getDocs(collection(db, COLLECTION_NAME));
        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    } catch (e) {}
};

export const pushLocalBackupToCloud = async (): Promise<number> => {
    const localData = localStorage.getItem("creata_fabrics_offline_backup");
    if (!localData) throw new Error("No hay datos locales.");
    
    let parsed: Fabric[] = [];
    try { parsed = JSON.parse(localData); } catch (e) { throw new Error("Respaldo corrupto."); }

    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("El respaldo está vacío.");

    await initAuth();
    if (globalOfflineMode) throw new Error(`Sin conexión: ${lastConnectionError}`);

    for (const fabric of parsed) {
        await saveFabricToFirestore(fabric);
    }
    
    return parsed.length;
};

export const isOfflineMode = () => globalOfflineMode;
export const isAuthConfigMissing = () => authConfigMissing;
