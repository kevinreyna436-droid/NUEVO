
import React, { useState, useEffect, useMemo } from 'react';
import FabricCard from './components/FabricCard';
import FabricDetail from './components/FabricDetail';
import UploadModal from './components/UploadModal';
import ChatBot from './components/ChatBot';
import PinModal from './components/PinModal';
import ImageGenModal from './components/ImageGenModal';
import Visualizer from './components/Visualizer';
import EditFurnitureModal from './components/EditFurnitureModal';
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
  retryAuth
} from './services/firebase';

// Type for Sorting
type SortOption = 'color' | 'name' | 'model' | 'supplier';

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
  const [authMissing, setAuthMissing] = useState(false);
  
  // App Lock State
  const [isAppLocked, setIsAppLocked] = useState(true);

  // Sorting/Filtering State
  const [sortBy, setSortBy] = useState<SortOption>('color');
  const [isRecentOnly, setIsRecentOnly] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [isSupplierMenuOpen, setSupplierMenuOpen] = useState(false);

  // Furniture Edit State
  const [selectedFurnitureToEdit, setSelectedFurnitureToEdit] = useState<FurnitureTemplate | null>(null);

  // State for Visualizer Pre-selection
  const [visualizerPreSelection, setVisualizerPreSelection] = useState<{model: string, color: string} | null>(null);

  // State for Color View Lightbox (Vista Colores - Ampliar)
  const [colorLightbox, setColorLightbox] = useState<{
    isOpen: boolean;
    image: string;
    fabricId: string;
    colorName: string;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const dbData = await getFabricsFromFirestore();
      const furnitureData = await getFurnitureTemplatesFromFirestore();
      
      setFurnitureTemplates(furnitureData);
      setOfflineStatus(isOfflineMode());
      setAuthMissing(isAuthConfigMissing());

      if (dbData && dbData.length > 0) {
        setFabrics(dbData);
      } else {
        setFabrics([]); 
      }
    } catch (e: any) {
      console.error("Error loading data", e?.message || "Unknown error");
      setFabrics([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUploadClick = () => {
      setPinModalOpen(true);
  };

  const handleFabricClick = (fabric: Fabric, specificColor?: string) => {
    // This is the main card click handler.
    // In 'model' tab -> Go to detail.
    // In 'color' tab -> Open Lightbox (Requested Behavior).
    if (activeTab === 'model') {
        setSelectedFabricId(fabric.id);
        setView('detail');
    } else {
        const img = specificColor && fabric.colorImages?.[specificColor] 
            ? fabric.colorImages[specificColor] 
            : fabric.mainImage;
        
        setColorLightbox({
            isOpen: true,
            image: img || '', 
            fabricId: fabric.id,
            colorName: specificColor || 'Unknown'
        });
    }
  };

  const handleGoToDetail = (fabric: Fabric) => {
      setSelectedFabricId(fabric.id);
      setView('detail');
  };

  const handleQuickView = (img: string, fabric: Fabric, colorName?: string) => {
        setColorLightbox({
            isOpen: true,
            image: img, 
            fabricId: fabric.id,
            colorName: colorName || 'Vista Rápida'
        });
  };

  const handleVisualizeAction = (fabric: Fabric, color?: string) => {
      const colorName = color || (fabric.colors?.[0] || '');
      setVisualizerPreSelection({ model: fabric.name, color: colorName });
      setActiveTab('visualizer');
      setView('grid');
  };

  const handleSaveFabric = async (newFabric: Fabric) => {
    try {
      setFabrics(prev => [newFabric, ...prev.filter(f => f.id !== newFabric.id)]);
      await saveFabricToFirestore(newFabric);
      setView('grid');
    } catch (e) {
      console.error("Error saving fabric:", e);
    }
  };

  const handleBulkSaveFabrics = async (newFabrics: Fabric[]) => {
    try {
      setFabrics(prev => [...newFabrics, ...prev]);
      await saveBatchFabricsToFirestore(newFabrics);
      setView('grid');
    } catch (e) {
      console.error("Error bulk saving:", e);
    }
  };

  const handleUpdateFabric = async (updatedFabric: Fabric) => {
    try {
      setFabrics(prev => prev.map(f => f.id === updatedFabric.id ? updatedFabric : f));
      await saveFabricToFirestore(updatedFabric);
    } catch (e) {
      console.error("Error updating fabric:", e);
    }
  };

  const handleDeleteFabric = async (fabricId: string) => {
      try {
          setFabrics(prev => prev.filter(f => f.id !== fabricId));
          setView('grid');
          await deleteFabricFromFirestore(fabricId);
      } catch (e) {
          console.error("Error deleting fabric:", e);
      }
  };

  const handleReset = async () => {
    if (window.confirm("¿Estás seguro de que quieres borrar todo el catálogo de la nube?")) {
      try {
        await clearFirestoreCollection();
        setFabrics([]);
        alert("Catálogo borrado exitosamente.");
      } catch (e) {
        console.error("Error clearing catalog:", e);
      }
    }
  };

  const handleSaveFurniture = async (template: FurnitureTemplate) => {
    try {
      const saved = await saveFurnitureTemplateToFirestore(template);
      setFurnitureTemplates(prev => [saved, ...prev.filter(t => t.id !== template.id)]);
    } catch (e) {
      console.error("Error saving furniture:", e);
    }
  };

  const handleDeleteFurniture = async (id: string) => {
    try {
      await deleteFurnitureTemplateFromFirestore(id);
      setFurnitureTemplates(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      console.error("Error deleting furniture:", e);
    }
  };

  const handleEditFurnitureRequest = (template: FurnitureTemplate) => {
      setSelectedFurnitureToEdit(template);
  };

  const toSentenceCase = (str: string) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  // --- MEMOIZED FILTERING LOGIC ---
  
  const filteredItems = useMemo(() => {
    let items = [...fabrics];
    
    if (isRecentOnly) {
        const fifteenDaysInMs = 15 * 24 * 60 * 60 * 1000;
        items = items.filter(f => {
            try {
                const ts = parseInt(f.id.substring(0, 13));
                return Date.now() - ts < fifteenDaysInMs;
            } catch(e) { return false; }
        });
    }

    if (selectedSupplier === 'CREATA_STOCK') {
        items = items.filter(f => Object.keys(IN_STOCK_DB).some(k => k.toLowerCase() === f.name.toLowerCase()));
    } else if (selectedSupplier) {
        items = items.filter(f => f.supplier === selectedSupplier);
    }

    if (searchQuery) {
        items = items.filter(f => 
            f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (f.colors || []).some(c => c.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }
    return items;
  }, [fabrics, isRecentOnly, selectedSupplier, searchQuery]);


  const sortedModelCards = useMemo(() => {
      const sortedItems = [...filteredItems.filter(f => f.category !== 'wood')];
      if (isRecentOnly) {
          sortedItems.sort((a, b) => b.id.localeCompare(a.id));
      } else {
          sortedItems.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      }
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

      if (isRecentOnly) {
        allColorCards.sort((a, b) => b.fabric.id.localeCompare(a.fabric.id));
      } else {
        allColorCards.sort((a, b) => a.colorName.localeCompare(b.colorName, 'es'));
      }
      return allColorCards;
  }, [filteredItems, selectedSupplier, isRecentOnly]);


  const uniqueSuppliers = useMemo(() => {
      return Array.from(new Set(fabrics.map(f => f.supplier).filter(Boolean))).sort();
  }, [fabrics]);


  const renderGridContent = () => {
    if (activeTab === 'model') {
        return sortedModelCards.map((fabric, idx) => (
            <FabricCard 
                key={fabric.id} 
                fabric={fabric} 
                mode="model" 
                onClick={() => handleFabricClick(fabric)} 
                onDetail={() => handleGoToDetail(fabric)}
                onQuickView={(img) => handleQuickView(img, fabric)}
                onVisualize={() => handleVisualizeAction(fabric)}
                index={idx} 
            />
        ));
    }
    if (activeTab === 'color') {
        return sortedColorCards.map((item, idx) => (
            <FabricCard 
                key={`${item.fabric.id}-${item.colorName}-${idx}`} 
                fabric={item.fabric} 
                mode="color" 
                specificColorName={item.colorName} 
                onClick={() => handleFabricClick(item.fabric, item.colorName)} 
                onDetail={() => handleGoToDetail(item.fabric)}
                onQuickView={(img) => handleQuickView(img, item.fabric, item.colorName)}
                onVisualize={() => handleVisualizeAction(item.fabric, item.colorName)}
                index={idx} 
            />
        ));
    }
    if (activeTab === 'visualizer') return <Visualizer fabrics={fabrics} templates={furnitureTemplates} initialSelection={visualizerPreSelection} onEditFurniture={handleEditFurnitureRequest} />;
  };

  return (
    <div className="min-h-screen bg-[rgb(241,242,244)] text-primary font-sans relative">
      
      {/* Lightbox para Vista Colores */}
      {colorLightbox && colorLightbox.isOpen && (
          <div 
            className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 cursor-pointer" 
            onClick={() => setColorLightbox(null)}
          >
              <img src={colorLightbox.image} className="max-w-full max-h-full rounded-lg shadow-2xl animate-fade-in" alt={colorLightbox.colorName} />
              
              <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 text-white text-center pointer-events-none">
                  <h3 className="text-2xl font-serif font-bold">{toSentenceCase(colorLightbox.colorName)}</h3>
                  <p className="text-sm uppercase tracking-widest opacity-80">{fabrics.find(f => f.id === colorLightbox.fabricId)?.name}</p>
              </div>

              <button className="absolute top-6 right-6 text-white/70 hover:text-white">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
          </div>
      )}

      {isAppLocked && (
          <PinModal 
            isOpen={true} 
            onClose={() => {}} 
            onSuccess={() => setIsAppLocked(false)} 
            requiredPin="2717"
            isBlocking={true}
          />
      )}

      {!isAppLocked && (
          <>
            <button onClick={handleUploadClick} className="fixed top-4 right-4 z-50 text-gray-300 hover:text-black font-bold text-2xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white transition-colors">.</button>
            <PinModal isOpen={isPinModalOpen} onClose={() => setPinModalOpen(false)} onSuccess={() => setUploadModalOpen(true)} requiredPin="2717" />

            {selectedFurnitureToEdit && (
                <EditFurnitureModal 
                    furniture={selectedFurnitureToEdit} 
                    onClose={() => setSelectedFurnitureToEdit(null)}
                    onSave={handleSaveFurniture}
                    onDelete={handleDeleteFurniture}
                />
            )}

            {view === 'grid' && (
                <header className="pt-16 pb-12 px-6 flex flex-col items-center space-y-8 animate-fade-in-down relative text-center">
                    <h1 className="font-serif text-6xl md:text-8xl font-bold tracking-tight text-slate-900 leading-none text-center">Catálogo de Telas</h1>
                    
                    <div className="flex space-x-8 md:space-x-12">
                        <button onClick={() => { setActiveTab('model'); }} className={`pb-2 text-sm font-medium uppercase tracking-wide transition-colors ${activeTab === 'model' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-gray-600'}`}>Ver modelos</button>
                        <button onClick={() => { setActiveTab('color'); }} className={`pb-2 text-sm font-medium uppercase tracking-wide transition-colors ${activeTab === 'color' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-gray-600'}`}>Ver colores</button>
                        <button onClick={() => { setActiveTab('visualizer'); }} className={`pb-2 text-sm font-bold tracking-wide uppercase transition-colors flex items-center gap-1 ${activeTab === 'visualizer' ? 'text-black border-b-2 border-black' : 'text-accent hover:text-yellow-600'}`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                            Probar
                        </button>
                    </div>
                    
                    {activeTab !== 'visualizer' && (
                    <div className="flex flex-row items-center gap-3 w-full max-w-2xl relative">
                        <div className="relative flex-grow">
                        <input type="text" placeholder="Buscar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white border border-gray-200 rounded-full py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-black placeholder-gray-400 shadow-sm" />
                        <svg className="absolute left-4 top-3.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>

                        <div className="relative">
                            <button onClick={() => setSupplierMenuOpen(!isSupplierMenuOpen)} className={`w-11 h-11 flex items-center justify-center rounded-full border transition-all ${isSupplierMenuOpen || selectedSupplier || isRecentOnly ? 'bg-black text-white border-black shadow-lg scale-105' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`} title="Filtros">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                            </button>
                            {isSupplierMenuOpen && (
                                <div className="absolute right-0 top-full mt-3 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-50 overflow-hidden animate-fade-in max-h-80 overflow-y-auto hide-scrollbar">
                                    <div className="px-4 py-2 text-[10px] uppercase font-bold text-gray-400 tracking-wider border-b border-gray-50 mb-1">FILTRAR POR</div>
                                    
                                    <button 
                                        onClick={() => { setIsRecentOnly(!isRecentOnly); setSupplierMenuOpen(false); }}
                                        className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${isRecentOnly ? 'text-blue-600 font-bold bg-blue-50' : 'text-gray-600'}`}
                                    >
                                        <span>Recientes</span>
                                        {isRecentOnly && <span className="text-blue-600">•</span>}
                                    </button>

                                    <button onClick={() => { setSelectedSupplier(null); setIsRecentOnly(false); setSupplierMenuOpen(false); }} className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 ${!selectedSupplier && !isRecentOnly ? 'text-black font-bold bg-gray-50' : 'text-gray-600'}`}>
                                        <span>Ver Todos</span>
                                    </button>

                                    <button onClick={() => { setSelectedSupplier('CREATA_STOCK'); setSupplierMenuOpen(false); }} className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 ${selectedSupplier === 'CREATA_STOCK' ? 'text-green-600 font-bold bg-green-50' : 'text-green-600 font-medium'}`}>
                                        <div className="flex items-center gap-2"><span>Creata (Stock)</span><div className="w-2 h-2 bg-green-500 rounded-full"></div></div>
                                    </button>

                                    <div className="border-t border-gray-100 my-1"></div>
                                    <div className="px-4 py-1 text-[9px] font-bold text-gray-300 uppercase">Proveedores</div>
                                    {uniqueSuppliers.map(supplier => (
                                        <button key={supplier} onClick={() => { setSelectedSupplier(supplier); setSupplierMenuOpen(false); }} className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 ${selectedSupplier === supplier ? 'text-black font-bold bg-gray-50' : 'text-gray-600'}`}>
                                            <span>{supplier}</span>
                                        </button>
                                    ))}
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
                        loading ? <div className="py-20 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div></div> : (
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

            <UploadModal isOpen={isUploadModalOpen} onClose={() => setUploadModalOpen(false)} onSave={handleSaveFabric} onBulkSave={handleBulkSaveFabrics} onReset={handleReset} existingFabrics={fabrics} existingFurniture={furnitureTemplates} onSaveFurniture={handleSaveFurniture} onDeleteFurniture={handleDeleteFurniture} />
            <ChatBot fabrics={fabrics} />
          </>
      )}
    </div>
  );
}

export default App;
