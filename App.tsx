import React, { useState, useEffect, useMemo } from 'react';
import FabricCard from './components/FabricCard';
import FabricDetail from './components/FabricDetail';
import UploadModal from './components/UploadModal';
import ChatBot from './components/ChatBot';
import PinModal from './components/PinModal';
import ImageGenModal from './components/ImageGenModal';
import Visualizer from './components/Visualizer';
import EditFurnitureModal from './components/EditFurnitureModal';
import { IN_STOCK_DB, INITIAL_FABRICS } from './constants';
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
  retryAuth,
  pushLocalBackupToCloud
} from './services/firebase';

function App() {
  const [view, setView] = useState<AppView>('grid');
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [furnitureTemplates, setFurnitureTemplates] = useState<FurnitureTemplate[]>([]);
  const [selectedFabricId, setSelectedFabricId] = useState<string | null>(null);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [isPinModalOpen, setPinModalOpen] = useState(false); 
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'model' | 'color' | 'visualizer'>('model');
  const [loading, setLoading] = useState(true);
  const [offlineStatus, setOfflineStatus] = useState(false);
  const [showRescueModal, setShowRescueModal] = useState(false);
  const [localBackupCount, setLocalBackupCount] = useState(0);
  const [isAppLocked, setIsAppLocked] = useState(true);
  const [isRecentOnly, setIsRecentOnly] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [isSupplierMenuOpen, setSupplierMenuOpen] = useState(false);
  const [selectedFurnitureToEdit, setSelectedFurnitureToEdit] = useState<FurnitureTemplate | null>(null);
  const [visualizerPreSelection, setVisualizerPreSelection] = useState<{model: string, color: string} | null>(null);
  const [colorLightbox, setColorLightbox] = useState<{isOpen: boolean; image: string; fabricId: string; colorName: string;} | null>(null);

  const loadData = async () => {
    setLoading(true);
    // Verificar respaldo local (donde se guardan las fotos temporalmente)
    const localBackup = localStorage.getItem("creata_fabrics_offline_backup");
    let localCount = 0;
    if (localBackup) {
        try {
            const parsed = JSON.parse(localBackup);
            if (Array.isArray(parsed) && parsed.length > 0) {
                // Solo contar si tienen imagen
                localCount = parsed.filter((f: any) => f.mainImage && f.mainImage.startsWith('data:')).length;
                setLocalBackupCount(localCount);
            }
        } catch(e) {}
    }

    try {
      const dbData = await getFabricsFromFirestore();
      const furnitureData = await getFurnitureTemplatesFromFirestore();
      setFurnitureTemplates(furnitureData);
      setOfflineStatus(isOfflineMode());
      
      if (dbData && dbData.length > 0) {
        setFabrics(dbData);
      } else {
        // Si no hay nada en la nube, cargar iniciales
        setFabrics(INITIAL_FABRICS);
        if (localCount > 0) setShowRescueModal(true);
      }
    } catch (e: any) {
      setFabrics(INITIAL_FABRICS);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const handleUpdateFabric = async (updatedFabric: Fabric) => {
    try {
      setFabrics(prev => prev.map(f => f.id === updatedFabric.id ? updatedFabric : f));
      await saveFabricToFirestore(updatedFabric);
    } catch (e) { console.error("Error updating fabric:", e); }
  };

  const handleFabricClick = (fabric: Fabric, specificColor?: string) => {
    if (activeTab === 'model') { setSelectedFabricId(fabric.id); setView('detail'); }
    else {
        const img = specificColor && fabric.colorImages?.[specificColor] ? fabric.colorImages[specificColor] : fabric.mainImage;
        setColorLightbox({ isOpen: true, image: img || '', fabricId: fabric.id, colorName: specificColor || 'Unknown' });
    }
  };

  const handleVisualizeAction = (fabric: Fabric, color?: string) => {
      const colorName = color || (fabric.colors?.[0] || '');
      setVisualizerPreSelection({ model: fabric.name, color: colorName });
      setActiveTab('visualizer');
      setView('grid');
  };

  const handleRestoreLocalData = async () => {
    setLoading(true);
    setShowRescueModal(false);
    try {
        const count = await pushLocalBackupToCloud();
        alert(`¡Restauración completada! Se han sincronizado ${count} registros con sus imágenes.`);
        loadData();
    } catch(e: any) {
        alert("Error al restaurar: " + e.message);
        setLoading(false);
    }
  };

  const handleClearDatabase = async () => {
      if (window.confirm("¡ATENCIÓN! ¿Estás seguro de que quieres BORRAR TODO el catálogo?\n\nEsta acción eliminará todas las telas y no se puede deshacer.")) {
          setLoading(true);
          try {
              await clearFirestoreCollection();
              await loadData();
              alert("Base de datos borrada correctamente.");
          } catch (e) {
              console.error(e);
              alert("Error al borrar la base de datos.");
          } finally {
              setLoading(false);
          }
      }
  };

  const filteredItems = useMemo(() => {
    let items = [...fabrics];
    if (searchQuery) {
        items = items.filter(f => 
            f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (f.colors || []).some(c => c.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }
    return items;
  }, [fabrics, searchQuery]);

  const renderGridContent = () => {
    if (activeTab === 'model') {
        return filteredItems.filter(f => f.category !== 'wood').sort((a,b)=>a.name.localeCompare(b.name)).map((fabric, idx) => (
            <FabricCard 
                key={fabric.id} fabric={fabric} mode="model" 
                onClick={() => handleFabricClick(fabric)} onDetail={() => setSelectedFabricId(fabric.id)}
                onQuickView={(img) => setColorLightbox({ isOpen: true, image: img, fabricId: fabric.id, colorName: 'Vista Rápida' })}
                onVisualize={() => handleVisualizeAction(fabric)} onUpdate={handleUpdateFabric}
                index={idx} 
            />
        ));
    }
    if (activeTab === 'color') {
        let allColorCards = filteredItems.filter(f => f.category !== 'wood').flatMap((fabric) => (fabric.colors || []).map((colorName) => ({ fabric, colorName })));
        allColorCards.sort((a,b)=>a.colorName.localeCompare(b.colorName));
        return allColorCards.map((item, idx) => (
            <FabricCard 
                key={`${item.fabric.id}-${item.colorName}-${idx}`} fabric={item.fabric} mode="color" 
                specificColorName={item.colorName} onClick={() => handleFabricClick(item.fabric, item.colorName)} 
                onDetail={() => setSelectedFabricId(item.fabric.id)} onQuickView={(img) => setColorLightbox({ isOpen: true, image: img, fabricId: item.fabric.id, colorName: item.colorName })}
                onVisualize={() => handleVisualizeAction(item.fabric, item.colorName)} onUpdate={handleUpdateFabric}
                index={idx} 
            />
        ));
    }
    if (activeTab === 'visualizer') return <Visualizer fabrics={fabrics} templates={furnitureTemplates} initialSelection={visualizerPreSelection} onEditFurniture={(t)=>setSelectedFurnitureToEdit(t)} />;
  };

  return (
    <div className="min-h-screen bg-[rgb(241,242,244)] text-primary font-sans relative">
      {/* Rescue Modal */}
      {showRescueModal && (
        <div className="fixed inset-0 z-[400] bg-black/90 flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white max-w-md w-full rounded-3xl p-8 text-center shadow-2xl relative">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4 4m0 0L8 8m4-4v12" /></svg>
                </div>
                <h2 className="text-2xl font-serif font-bold mb-2">Sincronizar Fotos</h2>
                <p className="text-gray-600 mb-6 text-sm">Hemos detectado {localBackupCount} fotos en este dispositivo que no están en la nube. ¿Quieres subirlas ahora?</p>
                <button onClick={handleRestoreLocalData} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold uppercase tracking-widest text-sm shadow-xl hover:scale-105 transition-transform">Subir Fotos a la Nube</button>
                <button onClick={() => setShowRescueModal(false)} className="text-gray-400 text-xs font-bold uppercase mt-4">Ahora no</button>
            </div>
        </div>
      )}

      {/* Floating Action for Repair */}
      {!showRescueModal && localBackupCount > 0 && (
          <button 
              onClick={() => setShowRescueModal(true)}
              className="fixed bottom-24 left-4 z-50 bg-blue-600 text-white px-6 py-3 rounded-full text-xs font-bold shadow-2xl hover:bg-blue-700 transition-colors flex items-center gap-2 animate-bounce border border-blue-400"
          >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Sincronizar Fotos ({localBackupCount})
          </button>
      )}

      {/* Status Bar */}
      <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 items-start">
        <div className={`px-4 py-2 rounded-full text-[10px] font-bold shadow-sm border border-gray-200 flex items-center gap-2 transition-all duration-500 ${offlineStatus ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white/80 backdrop-blur text-green-700'}`}>
            <div className={`w-2 h-2 rounded-full ${offlineStatus ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
            {offlineStatus ? <span>Modo Offline</span> : <span>Conectado ({fabrics.length} telas)</span>}
        </div>
      </div>

      {isAppLocked && <PinModal isOpen={true} onClose={() => {}} onSuccess={() => setIsAppLocked(false)} requiredPin="3942" isBlocking={true} />}

      {!isAppLocked && (
          <>
            <button onClick={() => setPinModalOpen(true)} className="fixed top-4 right-4 z-50 text-gray-300 hover:text-black font-bold text-2xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white transition-colors">.</button>
            <PinModal isOpen={isPinModalOpen} onClose={() => setPinModalOpen(false)} onSuccess={() => setUploadModalOpen(true)} requiredPin="3942" />

            {view === 'grid' && (
                <header className="pt-16 pb-12 px-6 flex flex-col items-center space-y-8 animate-fade-in-down relative text-center">
                    <h1 className="font-serif text-6xl md:text-8xl font-bold tracking-tight text-slate-900 leading-none">Catálogo de Telas</h1>
                    <div className="flex space-x-8 md:space-x-12">
                        <button onClick={() => setActiveTab('model')} className={`pb-2 text-sm font-medium uppercase tracking-wide ${activeTab === 'model' ? 'text-black border-b-2 border-black' : 'text-gray-400'}`}>Modelos</button>
                        <button onClick={() => setActiveTab('color')} className={`pb-2 text-sm font-medium uppercase tracking-wide ${activeTab === 'color' ? 'text-black border-b-2 border-black' : 'text-gray-400'}`}>Colores</button>
                        <button onClick={() => setActiveTab('visualizer')} className={`pb-2 text-sm font-bold tracking-wide uppercase ${activeTab === 'visualizer' ? 'text-black border-b-2 border-black' : 'text-accent'}`}>Probar</button>
                    </div>
                    {activeTab !== 'visualizer' && (
                    <div className="flex flex-row items-center gap-3 w-full max-w-2xl relative">
                        <input type="text" placeholder="Buscar tela o color..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white border border-gray-200 rounded-full py-3 px-12 text-sm focus:ring-1 focus:ring-black outline-none shadow-sm" />
                    </div>
                    )}
                </header>
            )}

            <main>
                {view === 'grid' && (
                <div className="container mx-auto px-6 pb-20">
                    {loading ? <div className="py-20 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div></div> : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 xl:gap-8">
                            {renderGridContent()}
                        </div>
                    )}
                </div>
                )}
                {view === 'detail' && selectedFabricId && (
                <FabricDetail fabric={fabrics.find(f => f.id === selectedFabricId)!} onBack={() => setView('grid')} onEdit={handleUpdateFabric} onDelete={async (id)=>{await deleteFabricFromFirestore(id); setView('grid'); loadData();}} onVisualize={handleVisualizeAction} />
                )}
            </main>

            <UploadModal 
                isOpen={isUploadModalOpen} 
                onClose={() => setUploadModalOpen(false)} 
                onSave={async(f)=>{await saveFabricToFirestore(f); loadData();}} 
                onBulkSave={async(fs)=>{await saveBatchFabricsToFirestore(fs); loadData();}} 
                onReset={loadData} 
                existingFabrics={fabrics} 
                existingFurniture={furnitureTemplates} 
                onSaveFurniture={(t)=>saveFurnitureTemplateToFirestore(t)} 
                onDeleteFurniture={(id)=>deleteFurnitureTemplateFromFirestore(id)}
                onClearDatabase={handleClearDatabase} 
            />
            <ChatBot fabrics={fabrics} />
          </>
      )}
    </div>
  );
}

export default App;