
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
import { getAnalytics } from "firebase/analytics";
import { Fabric, FurnitureTemplate } from "../types";
import { FURNITURE_TEMPLATES as DEFAULT_FURNITURE } from "../constants";

// ==========================================
// CONFIGURACIÓN DE FIREBASE
// ==========================================

const defaultConfig = {
  apiKey: "AIzaSyCEQTcNm4F3E-9qnHTcwqK91XXLyQa6Cws",
  authDomain: "telas-pruebas.firebaseapp.com",
  projectId: "telas-pruebas",
  storageBucket: "telas-pruebas.firebasestorage.app",
  messagingSenderId: "924889236456",
  appId: "1:924889236456:web:4f9abc86478b16170f5a5d",
  measurementId: "G-V098WS2ZWM"
};

let firebaseConfig = defaultConfig;
// CAMBIO CRÍTICO: Se fuerza la conexión a 'telas' por defecto
let customDatabaseId: string | undefined = 'telas'; 
let isCustomConfig = false;

// LIMPIEZA AUTOMÁTICA DE CONFIGURACIÓN ANTIGUA
try {
    const savedConfig = localStorage.getItem('creata_firebase_config');
    if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed.type === 'service_account' || parsed.private_key) {
            localStorage.removeItem('creata_firebase_config');
        } 
    }
} catch(e) {}

try {
  const localConfig = localStorage.getItem('creata_firebase_config');
  if (localConfig) {
    const parsed = JSON.parse(localConfig);
    
    // Si hay configuración local, intentamos usarla, pero mantenemos 'telas' como fallback fuerte
    if (parsed.databaseId) {
        customDatabaseId = parsed.databaseId;
    }
    
    // Limpiamos el objeto config para que solo tenga las claves estándar de firebase
    const { databaseId, ...stdConfig } = parsed;
    
    if (stdConfig.apiKey && stdConfig.projectId && !stdConfig.private_key) {
      firebaseConfig = stdConfig;
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
let analytics: any;

try {
    app = firebaseApp.getApps().length === 0 ? firebaseApp.initializeApp(firebaseConfig) : firebaseApp.getApps()[0];
    auth = getAuth(app);
    analytics = getAnalytics(app);
    
    // Configuración estándar de Firestore SIN PERSISTENCIA
    // SOPORTE PARA BASE DE DATOS NOMBRADA (databaseId)
    if (customDatabaseId) {
        console.log(`Conectando a base de datos personalizada: ${customDatabaseId}`);
        db = initializeFirestore(app, {
            ignoreUndefinedProperties: true
        }, customDatabaseId);
    } else {
        db = initializeFirestore(app, {
            ignoreUndefinedProperties: true
        });
    }

    storage = getStorage(app);
} catch (error: any) {
    console.error("Firebase Init Error:", error);
    if (isCustomConfig) {
        console.warn("Configuración inválida detectada.");
    }
}

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

// --- SISTEMA DE ESPERA DE AUTENTICACIÓN ---
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
                    console.warn("Auth Failed (This is OK if rules are public):", e.code);
                    lastAuthErrorMessage = e.code || e.message;
                    if (e.code === 'auth/operation-not-allowed') authConfigMissing = true;
                    else if (e.code === 'auth/unauthorized-domain') lastAuthErrorMessage = "DOMAIN_ERROR";
                    else if (e.code === 'auth/api-key-not-valid.-please-pass-a-valid-api-key.') lastAuthErrorMessage = "INVALID_API_KEY";
                    resolve(null); // Resolve null instead of error to allow public access attempt
                });
            }
        });
    });

    // Timeout de 15s para auth, pero si falla devolvemos null para intentar acceso público
    return withTimeout(authPromise, 15000, "AUTH_TIMEOUT").catch(() => null);
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
        await withTimeout(setDoc(testRef, { status: "ok", ts: Date.now() }), 30000, "DB_TIMEOUT");
        return true; 
    } catch (error: any) {
        console.warn("Health Check Failed:", error.message);
        if (error.code === 'permission-denied') return false;
        // Si es otro error (ej. db no encontrada), asumimos que podría funcionar o fallar más tarde
        return true; 
    }
};

export const validateWriteAccess = async (): Promise<boolean> => {
    try {
        await waitForAuth();
        // Intentamos escribir. Si falla por permisos, devolvemos false.
        const testRef = doc(db, "_write_test", `test_${Date.now()}`);
        await setDoc(testRef, { test: true });
        await deleteDoc(testRef); 
        return true;
    } catch (e: any) {
        console.error("Write Validation Failed:", e);
        // Si es permiso denegado, devolvemos false explícitamente
        if (e.code === 'permission-denied' || e.message?.includes('permission-denied')) {
            return false;
        }
        // Para otros errores (timeout, network), permitimos intentar la operación real
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
    
    await waitForAuth(); // Intentamos auth, pero procedemos igual

    try {
        const storageRef = ref(storage, path);
        const blob = dataURItoBlob(base64String);
        
        await withTimeout(
            uploadBytes(storageRef, blob), 
            300000, 
            "UPLOAD_TIMEOUT"
        );

        return await getDownloadURL(storageRef);
    } catch (error: any) {
        console.error(`Upload failed (${path}):`, error.message);
        throw error; 
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

// --- API MÉTODOS ---

export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  await waitForAuth();
  try {
    const querySnapshot = await withTimeout<QuerySnapshot<DocumentData>>(
        getDocs(collection(db, COLLECTION_NAME)), 
        120000, 
        "READ_TIMEOUT"
    );
    const fabrics: Fabric[] = [];
    querySnapshot.forEach((doc) => fabrics.push(doc.data() as Fabric));
    return fabrics;
  } catch (error: any) {
    console.error("Error fetching from cloud:", error);
    throw error; 
  }
};

export const saveFabricToFirestore = async (fabric: Fabric) => {
  try {
    const user = await waitForAuth();
    if (!user) console.warn("Saving without auth (Public Mode)");
    
    // Subir imágenes primero
    const cloudFabric = await processFabricImagesForCloud(fabric);
    
    await withTimeout(
        setDoc(doc(db, COLLECTION_NAME, cloudFabric.id), cloudFabric, { merge: true }),
        180000, 
        "DB_WRITE_TIMEOUT"
    );
    return true;
  } catch (error: any) {
    console.error("Error guardando en nube:", error);
    if (error.code === 'permission-denied' || error.message.includes('permission-denied')) {
        throw new Error('permission-denied');
    }
    throw error;
  }
};

export const saveBatchFabricsToFirestore = async (fabrics: Fabric[]) => {
  for (const f of fabrics) { await saveFabricToFirestore(f); }
};

export const deleteFabricFromFirestore = async (fabricId: string) => {
  try {
    await waitForAuth();
    await deleteDoc(doc(db, COLLECTION_NAME, fabricId));
  } catch (error) { 
      console.error("Error delete cloud", error);
      throw error;
  }
};

export const getFurnitureTemplatesFromFirestore = async (): Promise<FurnitureTemplate[]> => {
    try {
        await waitForAuth();
        const querySnapshot = await withTimeout<QuerySnapshot<DocumentData>>(
            getDocs(collection(db, FURNITURE_COLLECTION)),
            60000, 
            "READ_TIMEOUT"
        );
        const furniture: FurnitureTemplate[] = [];
        querySnapshot.forEach((doc) => furniture.push(doc.data() as FurnitureTemplate));
        return furniture.length > 0 ? furniture : DEFAULT_FURNITURE;
    } catch (error) {
        return DEFAULT_FURNITURE; 
    }
};

export const saveFurnitureTemplateToFirestore = async (template: FurnitureTemplate) => {
    try {
        await waitForAuth();
        let imageUrl = template.imageUrl;
        if (imageUrl.startsWith('data:')) {
            const timestamp = Date.now();
            const cleanId = template.id.replace(/[^a-zA-Z0-9]/g, '_');
            imageUrl = await uploadImageToStorage(imageUrl, `furniture/${cleanId}_${timestamp}.jpg`);
        }
        const finalTemplate = { ...template, imageUrl };
        
        await withTimeout(
            setDoc(doc(db, FURNITURE_COLLECTION, finalTemplate.id), finalTemplate, { merge: true }),
            180000, 
            "DB_WRITE_TIMEOUT"
        );
        return finalTemplate;
    } catch (error) { 
        console.error("Error saving furniture cloud", error);
        throw error; 
    }
};

export const deleteFurnitureTemplateFromFirestore = async (id: string) => {
    try {
        await waitForAuth();
        await deleteDoc(doc(db, FURNITURE_COLLECTION, id));
    } catch (error) { console.error("Error deleting furniture:", error); throw error; }
};

export const clearFirestoreCollection = async () => {
    try {
        await waitForAuth();
        const snapshot = await getDocs(collection(db, COLLECTION_NAME));
        
        const totalDocs = snapshot.docs.length;
        if (totalDocs === 0) return;

        let batch = writeBatch(db);
        let count = 0;
        let batches = [];

        for (const doc of snapshot.docs) {
            batch.delete(doc.ref);
            count++;
            if (count >= 400) {
                batches.push(batch.commit());
                batch = writeBatch(db);
                count = 0;
            }
        }
        if (count > 0) {
            batches.push(batch.commit());
        }
        
        await Promise.all(batches);
    } catch(e) {
        console.error("Error crítico limpiando BD:", e);
        throw e;
    }
};

export const retryAuth = async () => {
    if (!auth) return false;
    try { await signInAnonymously(auth); return true; } catch (e) { return false; }
};

export const isOfflineMode = () => !auth; // Relaxed check
export const isAuthConfigMissing = () => authConfigMissing;
export const getAuthError = () => lastAuthErrorMessage;
export const isUsingCustomConfig = () => isCustomConfig;
