
import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import FabricCard from './components/FabricCard';
import FabricDetail from './components/FabricDetail';
import { IN_STOCK_DB } from './constants';
import { Fabric, AppView, FurnitureTemplate } from './types';
import { 
  getFabricsFromFirestore, 
  saveFabricToFirestore, 
  saveBatchFabricsToFirestore, 
  deleteFabricFromFirestore, 
  clearFirestoreCollection,
  getFurnitureTemplatesFromFirestore,
  saveFurnitureTemplateToFirestore,
  deleteFurnitureTemplateFromFirestore,
  isOfflineMode,
  isAuthConfigMissing,
  checkDatabasePermissions,
  retryAuth,
  getAuthError,
  isUsingCustomConfig
} from './services/firebase';

// Lazy Load Heavy Components
const UploadModal = lazy(() => import('./components/UploadModal'));
const ChatBot = lazy(() => import('./components/ChatBot'));
const PinModal = lazy(() => import('./components/PinModal'));
const ImageGenModal = lazy(() => import('./components/ImageGenModal'));
const Visualizer = lazy(() => import('./components/Visualizer'));
const EditFurnitureModal = lazy(() => import('./components/EditFurnitureModal'));

// Type for Sorting
type SortOption = 'color' | 'name' | 'model' | 'supplier';

// --- LOADING SCREEN ---
const LoadingScreen = ({ progress }: { progress: number }) => {
  const safeProgress = Math.min(100, Math.max(0, Math.round(progress)));
  return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-[#f2f2f2] transition-opacity duration-300">
      <div className="w-full max-w-md px-10 text-center">
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-2 tracking-tight">Creata</h1>
          <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400 mb-10">Cloud Collection Manager</p>
          <div className="relative w-full h-1 bg-gray-200 rounded-full overflow-hidden mb-4">
              <div className="absolute top-0 left-0 h-full bg-slate-900 transition-all duration-200 ease-out" style={{ width: `${safeProgress}%` }}></div>
          </div>
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-gray-400">
              <span>{safeProgress < 30 ? 'Conectando...' : safeProgress < 60 ? 'Cargando Datos...' : safeProgress < 90 ? 'Sincronizando...' : 'Finalizando...'}</span>
              <span className="text-slate-900">{safeProgress}%</span>
          </div>
      </div>
    </div>
  );
};

function App() {
  const [view, setView] = useState<AppView>('grid');
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [furnitureTemplates, setFurnitureTemplates] = useState<FurnitureTemplate[]>([]);
  const [selectedFabricId, setSelectedFabricId] = useState<string | null>(null);
  
  // Modals State
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [isPinModalOpen, setPinModalOpen] = useState(false); 
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'model' | 'color' | 'visualizer'>('model');
  
  // Loading & Progress State
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const [offlineStatus, setOfflineStatus] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  
  // New: Specific Rules Error Type
  const [showRulesError, setShowRulesError] = useState(false); 
  const [rulesErrorType, setRulesErrorType] = useState<'general' | 'storage'>('general');

  const [showConnectionInfo, setShowConnectionInfo] = useState(false);

  const [isAppLocked, setIsAppLocked] = useState(true);
  const [isRecentOnly, setIsRecentOnly] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [isSupplierMenuOpen, setSupplierMenuOpen] = useState(false);
  const [selectedFurnitureToEdit, setSelectedFurnitureToEdit] = useState<FurnitureTemplate | null>(null);
  const [visualizerPreSelection, setVisualizerPreSelection] = useState<{model: string, color: string} | null>(null);
  const [colorLightbox, setColorLightbox] = useState<{ isOpen: boolean; image: string; fabricId: string; colorName: string; } | null>(null);
  const [visibleItemsCount, setVisibleItemsCount] = useState(24);

  const loadData = async (forceRefresh = false) => {
    setLoading(true);
    setLoadingProgress(10);

    let interval = setInterval(() => {
        setLoadingProgress(prev => { if (prev >= 90) return 90; return prev + Math.random() * 15 + 5; });
    }, 150); 

    try {
      const [dbData, furnitureData] = await Promise.all([
          getFabricsFromFirestore(),
          getFurnitureTemplatesFromFirestore()
      ]);
      
      clearInterval(interval);
      setLoadingProgress(100);
      setFurnitureTemplates(furnitureData);
      setOfflineStatus(false);
      
      setFabrics(dbData || []);
      setLoading(false);

      setTimeout(async () => {
          if (isAuthConfigMissing() || isOfflineMode()) {
              const error = getAuthError();
              const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
              
              if (error === 'DOMAIN_ERROR' && !isLocalhost) {
                   setShowConnectionInfo(true);
              } else if (error && (error.includes('operation-not-allowed') || error.includes('configuration'))) {
                   setShowSetupGuide(true);
              }
          } else {
              const hasWritePermission = await checkDatabasePermissions();
              if (!hasWritePermission) {
                 setRulesErrorType('general');
                 setShowRulesError(true);
              }
          }
      }, 1500);

    } catch (e: any) {
      console.error("Error crítico cargando datos de nube:", e);
      clearInterval(interval);
      setLoadingProgress(100);
      setFabrics([]); 
      setOfflineStatus(true); 
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleForceRefresh = () => { setSupplierMenuOpen(false); loadData(true); };

  const handleScroll = () => {
    if (view !== 'grid' || activeTab === 'visualizer') return;
    const scrollTop = window.scrollY;
    const windowHeight = window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;
    if (windowHeight + scrollTop >= docHeight - 300) setVisibleItemsCount(prev => prev + 12);
  };

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [view, activeTab]);

  const handleUploadClick = () => { setPinModalOpen(true); };

  const handleFabricClick = (fabric: Fabric, specificColor?: string) => {
    if (activeTab === 'model') {
        setSelectedFabricId(fabric.id);
        setView('detail');
    } else {
        const img = specificColor && fabric.colorImages?.[specificColor] ? fabric.colorImages[specificColor] : fabric.mainImage;
        setColorLightbox({ isOpen: true, image: img || '', fabricId: fabric.id, colorName: specificColor || 'Unknown' });
    }
  };

  const handleGoToDetail = (fabric: Fabric) => { setSelectedFabricId(fabric.id); setView('detail'); };
  const handleQuickView = (img: string, fabric: Fabric, colorName?: string) => { setColorLightbox({ isOpen: true, image: img, fabricId: fabric.id, colorName: colorName || 'Vista Rápida' }); };
  const handleVisualizeAction = (fabric: Fabric, color?: string) => {
      const colorName = color || (fabric.colors?.[0] || '');
      setVisualizerPreSelection({ model: fabric.name, color: colorName });
      setActiveTab('visualizer');
      setView('grid');
  };

  const handleSaveFabric = async (newFabric: Fabric) => {
    try {
      setFabrics(prev => {
          const filtered = prev.filter(f => f.id !== newFabric.id);
          return [newFabric, ...filtered];
      });
      await saveFabricToFirestore(newFabric);
      setView('grid');
    } catch (e: any) {
      console.error("Error saving fabric:", e);
      loadData(); 
      
      // ERROR HANDLING MEJORADO
      if (e.message && e.message.includes("unauthorized")) {
          setRulesErrorType('storage'); // Específico de Storage
          setShowRulesError(true);
      } else if (e.message && e.message.includes("permission-denied")) {
          setRulesErrorType('general');
          setShowRulesError(true);
      }
      throw e;
    }
  };

  const handleBulkSaveFabrics = async (newFabrics: Fabric[]) => {
    try {
      setFabrics(prev => {
          const newNames = new Set(newFabrics.map(f => f.name.toLowerCase()));
          const filtered = prev.filter(f => !newNames.has(f.name.toLowerCase()));
          return [...newFabrics, ...filtered];
      });
      await saveBatchFabricsToFirestore(newFabrics);
      setView('grid');
    } catch (e: any) { 
        console.error("Error bulk saving:", e);
        loadData();
        
        if (e.message && e.message.includes("unauthorized")) {
             setRulesErrorType('storage');
             setShowRulesError(true);
        } else if (e.message && e.message.includes("permission-denied")) {
             setRulesErrorType('general');
             setShowRulesError(true);
        }
        throw e;
    }
  };

  const handleUpdateFabric = async (updatedFabric: Fabric) => {
    try {
      setFabrics(prev => prev.map(f => f.id === updatedFabric.id ? updatedFabric : f));
      await saveFabricToFirestore(updatedFabric);
    } catch (e: any) { 
        console.error("Error updating fabric:", e);
        if (e.message && e.message.includes("unauthorized")) {
             setRulesErrorType('storage');
             setShowRulesError(true);
        } else if (e.message && e.message.includes("permission-denied")) {
             setRulesErrorType('general');
             setShowRulesError(true);
        } else {
             alert("Error actualizando. Verifica conexión.");
        }
        loadData();
    }
  };

  const handleDeleteFabric = async (fabricId: string) => {
      try {
          setFabrics(prev => prev.filter(f => f.id !== fabricId));
          setView('grid');
          await deleteFabricFromFirestore(fabricId);
      } catch (e) { 
          console.error("Error deleting fabric:", e);
          alert("Error eliminando. Verifica conexión.");
          loadData();
      }
  };

  const handleReset = async () => {
    if (window.confirm("¡ATENCIÓN! 🗑️\n\n¿Estás seguro de que quieres BORRAR TODO el catálogo de la nube?\n\nEsta acción es irreversible.")) {
      try {
        setLoading(true);
        setLoadingProgress(50);
        await clearFirestoreCollection();
        setFabrics([]); 
        setLoadingProgress(100);
        alert("Catálogo borrado exitosamente.");
        setLoading(false);
      } catch (e) { 
          console.error("Error clearing catalog:", e);
          alert("Error al borrar. Verifica tu conexión.");
          setLoading(false);
      }
    }
  };

  const handleSaveFurniture = async (template: FurnitureTemplate) => {
    try {
      const saved = await saveFurnitureTemplateToFirestore(template);
      setFurnitureTemplates(prev => [saved, ...prev.filter(t => t.id !== template.id)]);
    } catch (e: any) { 
        console.error("Error saving furniture:", e);
        if (e.message && e.message.includes("unauthorized")) {
             setRulesErrorType('storage');
             setShowRulesError(true);
        } else if (e.message && e.message.includes("permission-denied")) {
             setRulesErrorType('general');
             setShowRulesError(true);
        }
    }
  };

  const handleDeleteFurniture = async (id: string) => {
    try {
      await deleteFurnitureTemplateFromFirestore(id);
      setFurnitureTemplates(prev => prev.filter(t => t.id !== id));
    } catch (e) { console.error("Error deleting furniture:", e); }
  };

  const handleEditFurnitureRequest = (template: FurnitureTemplate) => { setSelectedFurnitureToEdit(template); };
  const toSentenceCase = (str: string) => { if (!str) return ''; return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase(); };

  const handleExportCSV = () => {
    const BOM = "\uFEFF"; 
    const headers = ['Nombre', 'Proveedor', 'Categoría', 'Colores', 'Descripción Técnica', 'ID'];
    const rows = fabrics.map(f => [`"${f.name.replace(/"/g, '""')}"`, `"${f.supplier.replace(/"/g, '""')}"`, `"${f.category}"`, `"${(f.colors || []).join('; ')}"`, `"${(f.technicalSummary || '').replace(/"/g, '""')}"`, `"${f.id}"`]);
    const csvContent = BOM + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `catalogo_creata_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setSupplierMenuOpen(false);
  };

  const handleRetryConnection = async (silent = false) => {
      const isOnline = await retryAuth();
      setOfflineStatus(!isOnline);
      if(isOnline) {
          setShowSetupGuide(false);
          const hasWrite = await checkDatabasePermissions();
          if(!hasWrite) {
             setRulesErrorType('general');
             setShowRulesError(true);
          } else {
             setShowRulesError(false);
          }
          
          if(!silent) alert("¡Conectado! La nube está activa.");
          loadData(true); 
          return true;
      } else {
          const authError = getAuthError();
          if (authError && (authError.includes('operation-not-allowed') || authError.includes('configuration'))) {
             setShowSetupGuide(true);
          } else if (!silent && !showConnectionInfo) {
             alert("No se pudo conectar. Verifica tu internet o espera 1 minuto.");
          }
          return false;
      }
  };

  // --- MODALES DE DIAGNÓSTICO ---
  const ConnectionInfoModal = () => {
      const authError = getAuthError();
      const total = fabrics.length;
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      return (
        <div className="fixed inset-0 z-[450] bg-black/90 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
          <div className="bg-white max-w-lg w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col p-8 relative">
             <button onClick={() => setShowConnectionInfo(false)} className="absolute top-4 right-4 text-gray-400 hover:text-black"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
             <h2 className="text-2xl font-serif font-bold text-slate-900 mb-2 flex items-center gap-2">Estado de Conexión</h2>
             <div className="flex items-center gap-2 mb-6">
                 <div className={`w-3 h-3 rounded-full ${offlineStatus ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                 <span className={`text-sm font-bold uppercase tracking-widest ${offlineStatus ? 'text-red-500' : 'text-green-600'}`}>{offlineStatus ? 'Sin Conexión' : 'Conectado a Nube'}</span>
             </div>
             <div className="space-y-4 mb-6">
                 <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center"><span className="block text-3xl font-bold text-slate-900">{total}</span><span className="text-[10px] uppercase font-bold text-gray-400">Telas en Nube</span></div>
                 
                 {!isLocalhost && offlineStatus && authError === 'DOMAIN_ERROR' && (
                     <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 text-left animate-fade-in-up">
                         <div className="flex items-center gap-2 mb-3">
                             <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">!</div>
                             <p className="text-xs font-bold uppercase text-blue-500 tracking-widest">Falta un paso en Firebase</p>
                         </div>
                         <p className="text-sm text-blue-900 leading-relaxed mb-3">
                            Google ha bloqueado la conexión porque este sitio web no está en la lista blanca. Esto es normal cuando publicas la app por primera vez.
                         </p>
                         <div className="bg-white p-3 rounded-lg border border-blue-200 mb-3">
                             <p className="text-[10px] uppercase text-gray-400 font-bold mb-1">Debes autorizar este dominio:</p>
                             <code className="text-sm font-bold text-slate-900 select-all">{window.location.hostname}</code>
                         </div>
                         <p className="text-xs text-blue-800">
                            Ve a <strong>Authentication &gt; Settings &gt; Authorized Domains</strong> en tu consola y agrégalo.
                         </p>
                     </div>
                 )}

                 {offlineStatus && authError !== 'DOMAIN_ERROR' && (
                    <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-left">
                        <p className="text-[10px] font-bold uppercase text-red-400 tracking-widest mb-1">Error Detectado</p>
                        <p className="text-sm text-red-700 font-medium break-words">{authError || "Sin conexión a internet o bloqueo de firewall."}</p>
                    </div>
                 )}
                 
                 {!offlineStatus && <div className="bg-green-50 p-4 rounded-xl border border-green-100 text-left"><p className="text-sm text-green-700 font-medium flex items-center gap-2">Sincronización activa con Google Cloud.</p></div>}
             </div>
             <div className="flex gap-3"><button onClick={() => handleRetryConnection(false)} className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold uppercase text-xs hover:bg-black transition-colors">Reconectar</button></div>
          </div>
        </div>
      );
  };

  const RulesErrorModal = () => {
    const firestoreRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`;
    const storageRules = `rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}`;

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        alert("Código copiado al portapapeles.");
    };
    
    return (
      <div className="fixed inset-0 z-[350] bg-red-900/90 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white max-w-xl w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-6 bg-red-50 border-b border-red-100 flex items-center gap-4">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center shrink-0 animate-bounce">
                      <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  </div>
                  <div>
                      <h3 className="text-xl font-bold text-red-900">Permiso Denegado</h3>
                      <p className="text-xs text-red-700 uppercase tracking-wide font-bold">
                          {rulesErrorType === 'storage' ? 'Error al subir Imágenes' : 'Faltan reglas en tu consola'}
                      </p>
                  </div>
              </div>
              <div className="p-8 space-y-4 overflow-y-auto">
                  {rulesErrorType === 'storage' ? (
                      <>
                        <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 mb-2">
                             <p className="text-sm text-yellow-800 font-bold mb-1">💡 Diagnóstico Inteligente:</p>
                             <p className="text-xs text-yellow-900 leading-relaxed">
                                Parece que tienes reglas de <strong>Base de Datos (Firestore)</strong> pegadas en la sección de <strong>Storage (Imágenes)</strong>.
                                El código de Storage debe empezar por <code>service firebase.storage</code>.
                             </p>
                        </div>
                        <div className="flex justify-between items-center">
                            <p className="text-gray-700 text-sm font-medium">Copia esto en Storage {'>'} Rules:</p>
                            <button onClick={() => handleCopy(storageRules)} className="text-[10px] bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold uppercase hover:bg-blue-200">Copiar Código</button>
                        </div>
                        <div className="bg-gray-800 p-3 rounded-lg text-xs font-mono text-blue-400 overflow-x-auto border border-gray-700">
                             <pre>{storageRules}</pre>
                        </div>
                      </>
                  ) : (
                      <>
                        <p className="text-gray-700 text-sm font-medium">
                            Firebase está bloqueando tus datos. Actualiza las reglas en DOS lugares:
                        </p>
                        <div className="space-y-6">
                            <div>
                                <h4 className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs">1</span> 
                                    Firestore Database
                                </h4>
                                <div className="bg-gray-800 p-3 rounded-lg text-xs font-mono text-green-400 overflow-x-auto border border-gray-700">
                                    <pre>{firestoreRules}</pre>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs">2</span> 
                                    Storage (Imágenes)
                                </h4>
                                <div className="bg-gray-800 p-3 rounded-lg text-xs font-mono text-blue-400 overflow-x-auto border border-gray-700">
                                    <pre>{storageRules}</pre>
                                </div>
                            </div>
                        </div>
                      </>
                  )}
                  
                  <div className="pt-4 flex flex-col gap-3">
                      <button 
                          onClick={() => { setShowRulesError(false); window.location.reload(); }}
                          className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-black transition-colors"
                      >
                          Ya actualicé las reglas, Reintentar
                      </button>
                  </div>
              </div>
          </div>
      </div>
    );
  };

  const SetupGuide = () => {
      const [verifying, setVerifying] = useState(false);
      const handleCheck = async () => { setVerifying(true); const success = await handleRetryConnection(true); setVerifying(false); if(!success) alert("Aún no detectamos el permiso."); };
      return (
        <div className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white max-w-2xl w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-serif text-2xl font-bold text-red-600 flex items-center gap-2">⚠️ Habilitar Entrada Anónima</h3>
                    <button onClick={() => setShowSetupGuide(false)} className="text-gray-400 hover:text-black"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
                <div className="p-8 overflow-y-auto space-y-6">
                    <p className="text-gray-600">Firebase ha rechazado la conexión. Es probable que no hayas activado la autenticación anónima.</p>
                    <ol className="list-decimal list-inside space-y-2 text-sm font-medium text-slate-800 bg-gray-50 p-4 rounded-xl">
                        <li>Ve a <strong>Authentication</strong> en el menú lateral.</li>
                        <li>Haz clic en la pestaña <strong>Sign-in method</strong>.</li>
                        <li>Busca <strong>Anónimo (Anonymous)</strong> en la lista.</li>
                        <li>Activa el interruptor y dale a <strong>Guardar</strong>.</li>
                    </ol>
                    <div className="mt-6 text-center pt-4 border-t border-gray-100">
                        <button onClick={handleCheck} disabled={verifying} className="bg-green-600 text-white px-8 py-4 rounded-full font-bold uppercase tracking-widest text-xs hover:scale-105 transition-all shadow-lg shadow-green-200 disabled:opacity-70">{verifying ? 'Verificando...' : 'Ya lo activé, Conectar'}</button>
                    </div>
                </div>
            </div>
        </div>
      );
  };

  // --- FILTRADO ---
  const filteredItems = useMemo(() => {
    let items = [...fabrics];
    if (isRecentOnly) {
        const fifteenDaysInMs = 15 * 24 * 60 * 60 * 1000;
        items = items.filter(f => { try { if (f.id.startsWith('stock-')) return false; const ts = parseInt(f.id.substring(0, 13)); return Date.now() - ts < fifteenDaysInMs; } catch(e) { return false; } });
    }
    if (selectedSupplier === 'CREATA_STOCK') {
        items = items.filter(f => Object.keys(IN_STOCK_DB).some(k => k.toLowerCase() === f.name.toLowerCase()));
    } else if (selectedSupplier) {
        items = items.filter(f => f.supplier === selectedSupplier);
    }
    if (searchQuery) {
        items = items.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()) || (f.colors || []).some(c => c.toLowerCase().includes(searchQuery.toLowerCase())));
    }
    return items;
  }, [fabrics, isRecentOnly, selectedSupplier, searchQuery]);

  useEffect(() => { setVisibleItemsCount(24); window.scrollTo(0, 0); }, [selectedSupplier, isRecentOnly, searchQuery, activeTab]);

  const sortedModelCards = useMemo(() => {
      const sortedItems = [...filteredItems.filter(f => f.category !== 'wood')];
      if (isRecentOnly) sortedItems.sort((a, b) => b.id.localeCompare(a.id));
      else sortedItems.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      return sortedItems;
  }, [filteredItems, isRecentOnly]);

  const sortedColorCards = useMemo(() => {
      const items = filteredItems.filter(f => f.category !== 'wood');
      let allColorCards = items.flatMap((fabric) => (fabric.colors || []).map((colorName) => ({ fabric, colorName })));
      if (selectedSupplier === 'CREATA_STOCK') {
          allColorCards = allColorCards.filter(card => {
             const modelKey = Object.keys(IN_STOCK_DB).find(k => k.toLowerCase() === card.fabric.name.toLowerCase());
             if (!modelKey) return false;
             return IN_STOCK_DB[modelKey].some(c => c.toLowerCase() === card.colorName.toLowerCase());
          });
      }
      if (isRecentOnly) allColorCards.sort((a, b) => b.fabric.id.localeCompare(a.fabric.id));
      else allColorCards.sort((a, b) => a.colorName.localeCompare(b.colorName, 'es'));
      return allColorCards;
  }, [filteredItems, selectedSupplier, isRecentOnly]);

  const uniqueSuppliers = useMemo(() => Array.from(new Set(fabrics.map(f => f.supplier).filter(Boolean))).sort(), [fabrics]);

  const renderGridContent = () => {
    if (activeTab === 'model') {
        const visibleItems = sortedModelCards.slice(0, visibleItemsCount);
        return visibleItems.map((fabric, idx) => (<FabricCard key={fabric.id} fabric={fabric} mode="model" onClick={() => handleFabricClick(fabric)} onDetail={() => handleGoToDetail(fabric)} onQuickView={(img) => handleQuickView(img, fabric)} onVisualize={() => handleVisualizeAction(fabric)} index={idx} />));
    }
    if (activeTab === 'color') {
        const visibleItems = sortedColorCards.slice(0, visibleItemsCount);
        return visibleItems.map((item, idx) => (<FabricCard key={`${item.fabric.id}-${item.colorName}-${idx}`} fabric={item.fabric} mode="color" specificColorName={item.colorName} onClick={() => handleFabricClick(item.fabric, item.colorName)} onDetail={() => handleGoToDetail(item.fabric)} onQuickView={(img) => handleQuickView(img, item.fabric, item.colorName)} onVisualize={() => handleVisualizeAction(item.fabric, item.colorName)} index={idx} />));
    }
    if (activeTab === 'visualizer') {
        return (<Suspense fallback={<LoadingScreen progress={50} />}><Visualizer fabrics={fabrics} templates={furnitureTemplates} initialSelection={visualizerPreSelection} onEditFurniture={handleEditFurnitureRequest} /></Suspense>);
    }
  };

  return (
    <div className="min-h-screen bg-[rgb(241,242,244)] text-primary font-sans relative">
      {loading && <LoadingScreen progress={loadingProgress} />}
      {showSetupGuide && <SetupGuide />}
      {showRulesError && <RulesErrorModal />}
      {showConnectionInfo && <ConnectionInfoModal />}
      
      {colorLightbox && colorLightbox.isOpen && (
          <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4" onClick={() => setColorLightbox(null)}>
              <div className="relative flex flex-col items-center justify-center max-w-5xl w-full h-full pointer-events-none">
                  <img src={colorLightbox.image} className="max-w-full max-h-[70vh] rounded-sm shadow-2xl animate-fade-in pointer-events-auto cursor-default" alt={colorLightbox.colorName} onClick={(e) => e.stopPropagation()} />
                  <div className="mt-6 text-center text-white pointer-events-auto">
                      <h3 className="text-3xl font-serif font-bold mb-1">{toSentenceCase(colorLightbox.colorName)}</h3>
                      <p className="text-sm uppercase tracking-[0.2em] opacity-60 mb-6">{fabrics.find(f => f.id === colorLightbox.fabricId)?.name}</p>
                      <div className="flex items-center justify-center gap-4">
                          <button onClick={(e) => { e.stopPropagation(); const fabric = fabrics.find(f => f.id === colorLightbox.fabricId); if (fabric) { setColorLightbox(null); handleGoToDetail(fabric); }}} className="bg-white text-black px-6 py-3 rounded-full font-bold uppercase text-[10px] tracking-widest hover:bg-gray-200 transition-colors shadow-lg flex items-center gap-2"><span>Ver Ficha Modelo</span></button>
                          <button onClick={(e) => { e.stopPropagation(); const fabric = fabrics.find(f => f.id === colorLightbox.fabricId); if (fabric) { setColorLightbox(null); handleVisualizeAction(fabric, colorLightbox.colorName); }}} className="bg-transparent border border-white text-white px-6 py-3 rounded-full font-bold uppercase text-[10px] tracking-widest hover:bg-white/10 transition-colors shadow-lg flex items-center gap-2"><span>Probar</span></button>
                      </div>
                  </div>
              </div>
              <button onClick={() => setColorLightbox(null)} className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors cursor-pointer z-[210]"><svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
      )}

      {isAppLocked && (<Suspense fallback={<LoadingScreen progress={50} />}><PinModal isOpen={true} onClose={() => {}} onSuccess={() => setIsAppLocked(false)} requiredPin="1379" isBlocking={true} /></Suspense>)}

      {!isAppLocked && (
          <>
            <button onClick={handleUploadClick} className="fixed top-4 right-4 z-50 text-gray-300 hover:text-black font-bold text-2xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white transition-colors">.</button>
            <Suspense fallback={null}><PinModal isOpen={isPinModalOpen} onClose={() => setPinModalOpen(false)} onSuccess={() => setUploadModalOpen(true)} requiredPin="1379" /></Suspense>
            <Suspense fallback={<LoadingScreen progress={50} />}>{selectedFurnitureToEdit && (<EditFurnitureModal furniture={selectedFurnitureToEdit} onClose={() => setSelectedFurnitureToEdit(null)} onSave={handleSaveFurniture} onDelete={handleDeleteFurniture} />)}</Suspense>

            {view === 'grid' && (
                <header className="pt-16 pb-12 px-6 flex flex-col items-center space-y-8 animate-fade-in-down relative text-center">
                    <h1 className="font-serif text-6xl md:text-8xl font-bold tracking-tight text-slate-900 leading-none text-center">Catálogo de Telas</h1>
                    <div className="flex space-x-8 md:space-x-12">
                        <button onClick={() => { setActiveTab('model'); }} className={`pb-2 text-sm font-medium uppercase tracking-wide transition-colors ${activeTab === 'model' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-gray-600'}`}>Ver modelos</button>
                        <button onClick={() => { setActiveTab('color'); }} className={`pb-2 text-sm font-medium uppercase tracking-wide transition-colors ${activeTab === 'color' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-gray-600'}`}>Ver colores</button>
                        <button onClick={() => { setActiveTab('visualizer'); }} className={`pb-2 text-sm font-bold tracking-wide uppercase transition-colors flex items-center gap-1 ${activeTab === 'visualizer' ? 'text-black border-b-2 border-black' : 'text-accent hover:text-yellow-600'}`}>Probar</button>
                    </div>
                    {activeTab !== 'visualizer' && (
                    <div className="flex flex-row items-center gap-3 w-full max-w-2xl relative">
                        <div className="relative flex-grow">
                        <input type="text" placeholder="Buscar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white border border-gray-200 rounded-full py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-black placeholder-gray-400 shadow-sm" />
                        <svg className="absolute left-4 top-3.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                        <div className="relative">
                            <button onClick={() => setSupplierMenuOpen(!isSupplierMenuOpen)} className={`w-11 h-11 flex items-center justify-center rounded-full border transition-all ${isSupplierMenuOpen || selectedSupplier || isRecentOnly ? 'bg-black text-white border-black shadow-lg scale-105' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`} title="Filtros"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg></button>
                            {isSupplierMenuOpen && (
                                <div className="absolute right-0 top-full mt-3 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-50 overflow-hidden animate-fade-in max-h-80 overflow-y-auto hide-scrollbar">
                                    <div className="px-4 py-2 text-[10px] uppercase font-bold text-gray-400 tracking-wider border-b border-gray-50 mb-1">FILTRAR POR</div>
                                    <button onClick={() => { setIsRecentOnly(!isRecentOnly); setSupplierMenuOpen(false); }} className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${isRecentOnly ? 'text-blue-600 font-bold bg-blue-50' : 'text-gray-600'}`}><span>Recientes</span>{isRecentOnly && <span className="text-blue-600">•</span>}</button>
                                    <button onClick={() => { setSelectedSupplier(null); setIsRecentOnly(false); setSupplierMenuOpen(false); }} className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 ${!selectedSupplier && !isRecentOnly ? 'text-black font-bold bg-gray-50' : 'text-gray-600'}`}><span>Ver Todos</span></button>
                                    <button onClick={() => { setSelectedSupplier('CREATA_STOCK'); setSupplierMenuOpen(false); }} className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 ${selectedSupplier === 'CREATA_STOCK' ? 'text-green-600 font-bold bg-green-50' : 'text-green-600 font-medium'}`}><div className="flex items-center gap-2"><span>Creata (Stock)</span><div className="w-2 h-2 bg-green-500 rounded-full"></div></div></button>
                                    <div className="border-t border-gray-100 my-1"></div>
                                    <div className="px-4 py-1 text-[9px] font-bold text-gray-300 uppercase">Proveedores</div>
                                    {uniqueSuppliers.map(supplier => (
                                        <button key={supplier} onClick={() => { setSelectedSupplier(supplier); setSupplierMenuOpen(false); }} className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 ${selectedSupplier === supplier ? 'text-black font-bold bg-gray-50' : 'text-gray-600'}`}><span>{supplier}</span></button>
                                    ))}
                                    <div className="border-t border-gray-100 my-1"></div>
                                    <button onClick={handleExportCSV} className="w-full text-left px-4 py-3 text-sm flex items-center gap-2 hover:bg-gray-50 text-blue-600 font-bold"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg><span>Exportar Lista (CSV)</span></button>
                                    <button onClick={handleForceRefresh} className="w-full text-left px-4 py-3 text-sm flex items-center gap-2 hover:bg-gray-50 text-purple-600 font-bold border-t border-gray-100"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg><span>Recargar desde Nube</span></button>
                                </div>
                            )}
                            {isSupplierMenuOpen && <div className="fixed inset-0 z-40" onClick={() => setSupplierMenuOpen(false)}></div>}
                        </div>
                    </div>
                    )}
                </header>
            )}

            <main>
                {view === 'grid' && (
                <div className="container mx-auto px-6 pb-20 flex flex-col items-center">
                    {activeTab === 'visualizer' ? renderGridContent() : (
                         fabrics.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 opacity-50">
                                <svg className="w-20 h-20 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                <h3 className="text-xl font-serif font-bold text-gray-400">Catálogo Vacío (Nube)</h3>
                                <p className="text-sm text-gray-400 mt-2">No hay telas registradas en la base de datos.</p>
                                <p className="text-[10px] text-gray-300 mt-1 uppercase tracking-widest">Usa el botón "." para subir</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 xl:gap-8 w-full max-w-[1920px]">
                                {renderGridContent()}
                            </div>
                        )
                    )}
                </div>
                )}
                {view === 'detail' && selectedFabricId && (
                <FabricDetail 
                    fabric={fabrics.find(f => f.id === selectedFabricId)!} 
                    onBack={() => setView('grid')} 
                    onEdit={handleUpdateFabric} 
                    onDelete={handleDeleteFabric} 
                    onVisualize={handleVisualizeAction}
                />
                )}
            </main>
            
            <Suspense fallback={null}>
                <UploadModal isOpen={isUploadModalOpen} onClose={() => setUploadModalOpen(false)} onSave={handleSaveFabric} onBulkSave={handleBulkSaveFabrics} onReset={handleReset} existingFabrics={fabrics} existingFurniture={furnitureTemplates} onSaveFurniture={handleSaveFurniture} onDeleteFurniture={handleDeleteFurniture} />
                <ChatBot fabrics={fabrics} />
            </Suspense>
          </>
      )}
    </div>
  );
}

export default App;
