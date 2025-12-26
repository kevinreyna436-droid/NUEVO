
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

let firebaseConfig = defaultConfig;
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
    if (parsed.apiKey && parsed.projectId && !parsed.private_key) {
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
    
    // Configuración estándar de Firestore SIN PERSISTENCIA
    // Se elimina persistentLocalCache para obligar a la app a trabajar siempre contra la nube.
    db = initializeFirestore(app, {
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

    // Aumentado a 30s para dar tiempo a la autenticación anónima en redes muy lentas
    return withTimeout(authPromise, 30000, "AUTH_TIMEOUT").catch(() => null);
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
        // Aumentado a 30s para verificación inicial robusta
        await withTimeout(setDoc(testRef, { status: "ok", ts: Date.now() }), 30000, "DB_TIMEOUT");
        return true; 
    } catch (error: any) {
        console.warn("Health Check Failed:", error.message);
        if (error.code === 'permission-denied') return false;
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
            300000, // 5 minutos para subidas (imágenes pesadas)
            "UPLOAD_TIMEOUT"
        );

        return await getDownloadURL(storageRef);
    } catch (error: any) {
        console.error(`Upload failed (${path}):`, error.message);
        throw error; // Propagate error, no local fallback
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

// --- API MÉTODOS 100% ONLINE ---

export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  await waitForAuth();
  try {
    const querySnapshot = await withTimeout<QuerySnapshot<DocumentData>>(
        getDocs(collection(db, COLLECTION_NAME)), 
        120000, // 2 minutos para lectura inicial
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
    if (!user) throw new Error("No hay conexión con el servidor de autenticación.");
    
    // Subir imágenes primero
    const cloudFabric = await processFabricImagesForCloud(fabric);
    
    await withTimeout(
        setDoc(doc(db, COLLECTION_NAME, cloudFabric.id), cloudFabric, { merge: true }),
        180000, // Aumentado a 180s (3 minutos) para garantizar escritura en DB
        "DB_WRITE_TIMEOUT"
    );
    return true;
  } catch (error: any) {
    console.error("Error guardando en nube:", error);
    // Propagar errores de permisos específicamente para que la UI los maneje
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
            60000, // 60s
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
            180000, // Aumentado a 180s (3 minutos)
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

export const isOfflineMode = () => !auth || !auth.currentUser; 
export const isAuthConfigMissing = () => authConfigMissing;
export const getAuthError = () => lastAuthErrorMessage;
export const isUsingCustomConfig = () => isCustomConfig;
