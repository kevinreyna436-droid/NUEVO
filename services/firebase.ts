
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
let lastConnectionError = ""; // Guardar el error específico para diagnóstico

// Promesa para esperar a que la auth termine (éxito o fallo) antes de pedir datos
let authResolve: (value: void | PromiseLike<void>) => void;
const authReadyPromise = new Promise<void>((resolve) => {
    authResolve = resolve;
});

// Initialize Firebase
let app: firebaseApp.FirebaseApp;
let auth: any;
let db: any;
let storage: any;

try {
    app = firebaseApp.initializeApp(firebaseConfig);
    auth = getAuth(app);
    
    // Initialize Firestore
    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true
    });

    // Habilitar Persistencia Offline
    enableIndexedDbPersistence(db).catch((err) => {
        // Silenciosamente ignorar errores de persistencia en entornos restrictivos
    });

    storage = getStorage(app);
} catch (e: any) {
    console.warn("Firebase SDK Init: Fallback to offline mode.");
    globalOfflineMode = true;
    lastConnectionError = e.message || "Error inicializando SDK";
}

// Función para iniciar sesión
const initAuth = async () => {
    if (globalOfflineMode) {
        authResolve();
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
        
        // MANEJO DE ERRORES SILENCIOSO
        if (errorCode === 'auth/api-key-not-valid') {
             console.warn("⚠️ API Key de Firebase no válida o expirada. Pasando a MODO OFFLINE automáticamente.");
        } else if (errorCode === 'auth/configuration-not-found' || errorCode === 'auth/operation-not-allowed') {
             authConfigMissing = true;
             console.warn("⚠️ Auth Anónimo no habilitado. Pasando a MODO OFFLINE.");
        } else {
             console.warn(`⚠️ Error de conexión Firebase (${errorCode}). Pasando a MODO OFFLINE.`);
        }
        
        globalOfflineMode = true;
    } finally {
        authResolve();
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
        // Fallback silencioso si falla la subida
        return base64String;
    }
};

const processFabricImagesForCloud = async (fabric: Fabric): Promise<Fabric> => {
    // Si estamos offline, no intentamos subir, devolvemos tal cual (con base64)
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

export const retryAuth = async () => {
    await initAuth();
    return !authConfigMissing;
};

export const diagnoseConnection = async (): Promise<string> => {
    try {
        await authReadyPromise;
        
        if (globalOfflineMode) {
             let errorMsg = lastConnectionError;
             if (authConfigMissing) errorMsg = "Auth Anónimo no habilitado.";
             
             return `⚠️ ESTADO: DESCONECTADO (OFFLINE)\n\n` +
                    `La app NO puede conectar con '${firebaseConfig.projectId}'.\n` +
                    `Probable Causa: ${errorMsg}\n\n` +
                    `SOLUCIONES COMUNES:\n` +
                    `1. Firebase Console -> Authentication -> Sign-in method -> Activar 'Anonymous'.\n` +
                    `2. Verifica que tu 'projectId' sea correcto.\n`;
        }

        const user = getAuth().currentUser;
        if (!user) return "❌ Error Crítico: Auth Anónimo falló. Actívalo en la consola de Firebase.";
        
        // 1. Test Firestore Write (Base de Datos)
        try {
            const testDocRef = doc(db, '_health_check', 'connection_test');
            await setDoc(testDocRef, { 
                status: 'ok', 
                timestamp: new Date(), 
                user: user.uid 
            });
            await deleteDoc(testDocRef);
        } catch (e: any) {
            if (e.code === 'permission-denied') return "❌ ERROR PERMISOS DATABASE\n\nTu base de datos está bloqueada.\n\nSOLUCIÓN: Ve a Firebase Console -> Firestore Database -> Reglas\nY cambia 'allow read, write: if false;' por 'if true;'";
            throw e;
        }

        // 2. Test Storage Write (Imágenes)
        try {
            const storageRef = ref(storage, '_health_check/test.txt');
            await uploadString(storageRef, 'connection_test_string');
            await deleteObject(storageRef);
        } catch (e: any) {
             if (e.code === 'storage/unauthorized') return "❌ ERROR PERMISOS STORAGE (FOTOS)\n\nNo se pueden subir fotos.\n\nSOLUCIÓN: Ve a Firebase Console -> Storage -> Rules\nY cambia 'allow read, write: if false;' por 'if true;'";
             return `❌ ERROR STORAGE: ${e.message}`;
        }

        // 3. Test Firestore Read
        const snapshot = await getDocs(collection(db, COLLECTION_NAME));
        
        return `✅ CONEXIÓN PERFECTA\n\n` +
               `☁️ Proyecto: ${firebaseConfig.projectId}\n` +
