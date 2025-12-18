
import React, { useState, useEffect } from 'react';
import FabricCard from './components/FabricCard';
import FabricDetail from './components/FabricDetail';
import UploadModal from './components/UploadModal';
import ChatBot from './components/ChatBot';
import PinModal from './components/PinModal';
import ImageGenModal from './components/ImageGenModal';
import Visualizer from './components/Visualizer';
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
  const [isPinModalOpen, setPinModalOpen] = useState(false); // PIN Modal State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'model' | 'color' | 'visualizer'>('model');
  const [loading, setLoading] = useState(true);
  const [offlineStatus, setOfflineStatus] = useState(false);
  const [authMissing, setAuthMissing] = useState(false);
  
  // Sorting State - Default "color"
  const [sortBy, setSortBy] = useState<SortOption>('color');
  const [isFilterMenuOpen, setFilterMenuOpen] = useState(false);
  
  // New Filter: Recientes
  const [isRecentOnly, setIsRecentOnly] = useState(false);

  // Supplier Filter State
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [isSupplierMenuOpen, setSupplierMenuOpen] = useState(false);

  // State for Color View Lightbox (Global Grid)
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
    const interval = setInterval(() => {
        if (isAuthConfigMissing()) setAuthMissing(true);
        else if (authMissing) setAuthMissing(false); 
    }, 5000);
    return () => clearInterval(interval);
  }, [authMissing]);

  useEffect(() => {
    loadData();
  }, []);

  const handleRetryConnection = async () => {
      setLoading(true);
      const success = await retryAuth();
      if (success) {
          setAuthMissing(false);
          await loadData();
      } else {
          alert("Aún no detectamos la activación.");
      }
      setLoading(false);
  };

  const handleUploadClick = () => {
      setPinModalOpen(true);
  };

  const handleFabricClick = (fabric: Fabric, specificColor?: string) => {
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

  const handleSaveFurniture = async (template: FurnitureTemplate) => {
      try {
          setFurnitureTemplates(prev => [...prev.filter(t => t.id !== template.id), template]);
          await saveFurnitureTemplateToFirestore(template);
      } catch (e) {
          console.error("Error saving furniture", e);
      }
  };

  const handleDeleteFurniture = async (id: string) => {
      if(window.confirm("¿Eliminar mueble?")) {
          try {
              setFurnitureTemplates(prev => prev.filter(t => t.id !== id));
              await deleteFurnitureTemplateFromFirestore(id);
          } catch(e) {
              console.error("Error deleting furniture", e);
          }
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
      if(window.confirm("¿Borrar toda la información?")) {
          try {
            setFabrics([]);
            await clearFirestoreCollection();
            window.location.reload();
          } catch (e) {
            console.error("Error resetting:", e);
          }
      }
  };

  const goToDetailFromLightbox = () => {
    if (colorLightbox) {
        setSelectedFabricId(colorLightbox.fabricId);
        setView('detail');
        setColorLightbox(null);
    }
  };

  const getColorWeight = (colorName: string): number => {
      if (!colorName) return 50;
      const name = colorName.toLowerCase();
      if (name.includes('white') || name.includes('snow') || name.includes('ivory')) return 100;
      if (name.includes('cream') || name.includes('bone')) return 95;
      if (name.includes('beige') || name.includes('sand')) return 85;
      if (name.includes('grey') || name.includes('gris')) return 50;
      if (name.includes('black') || name.includes('negro')) return 0;
      return 50;
  };

  const getFilteredItems = () => {
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
  };

  const getSortedColorCards = () => {
      const items = getFilteredItems().filter(f => f.category !== 'wood');
      let allColorCards = items.flatMap((fabric) => (fabric.colors || []).map((colorName) => ({ fabric, colorName })));

      if (selectedSupplier === 'CREATA_STOCK') {
          allColorCards = allColorCards.filter(card => {
             const modelKey = Object.keys(IN_STOCK_DB).find(k => k.toLowerCase() === card.fabric.name.toLowerCase());
             if (!modelKey) return false;
             return IN_STOCK_DB[modelKey].some(c => c.toLowerCase() === card.colorName.toLowerCase());
          });
      }

      allColorCards.sort((a, b) => {
          if (sortBy === 'color') return getColorWeight(b.colorName) - getColorWeight(a.colorName);
          if (sortBy === 'name') return a.colorName.localeCompare(b.colorName, 'es');
          if (sortBy === 'model') return a.fabric.name.localeCompare(b.fabric.name, 'es');
          return 0;
      });
      return allColorCards;
  };

  const handleGlobalNav = (direction: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!colorLightbox) return;
    const cards = getSortedColorCards();
    const currentIndex = cards.findIndex(c => c.fabric.id === colorLightbox.fabricId && c.colorName === colorLightbox.colorName);
    if (currentIndex === -1) return;
    const newItem = cards[(currentIndex + direction + cards.length) % cards.length];
    setColorLightbox({
        isOpen: true,
        image: (newItem.colorName && newItem.fabric.colorImages?.[newItem.colorName]) || newItem.fabric.mainImage || '',
        fabricId: newItem.fabric.id,
        colorName: newItem.colorName
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (colorLightbox) {
            if (e.key === 'ArrowRight') handleGlobalNav(1);
            if (e.key === 'ArrowLeft') handleGlobalNav(-1);
            if (e.key === 'Escape') setColorLightbox(null);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [colorLightbox]);

  const renderGridContent = () => {
    const allItems = getFilteredItems();
    if (activeTab === 'model') {
        return allItems.filter(f => f.category !== 'wood').sort((a, b) => a.name.localeCompare(b.name, 'es')).map((fabric, idx) => (
            <FabricCard key={fabric.id} fabric={fabric} mode="model" onClick={() => handleFabricClick(fabric)} index={idx} />
        ));
    }
    if (activeTab === 'color') {
        return getSortedColorCards().map((item, idx) => (
            <FabricCard key={`${item.fabric.id}-${item.colorName}-${idx}`} fabric={item.fabric} mode="color" specificColorName={item.colorName} onClick={() => handleFabricClick(item.fabric, item.colorName)} index={idx} />
        ));
    }
    if (activeTab === 'visualizer') return <Visualizer fabrics={fabrics} templates={furnitureTemplates} />;
  };

  const uniqueSuppliers = Array.from(new Set(fabrics.map(f => f.supplier).filter(Boolean))).sort();

  return (
    <div className="min-h-screen bg-[rgb(241,242,244)] text-primary font-sans selection:bg-black selection:text-white relative">
      <button onClick={handleUploadClick} className="fixed top-4 right-4 z-50 text-gray-300 hover:text-black font-bold text-2xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white transition-colors">.</button>
      <PinModal isOpen={isPinModalOpen} onClose={() => setPinModalOpen(false)} onSuccess={() => setUploadModalOpen(true)} />

      {view === 'grid' && (
        <header className="pt-16 pb-12 px-6 flex flex-col items-center space-y-8 animate-fade-in-down relative">
            <h1 className="font-serif text-6xl md:text-8xl font-bold tracking-tight text-slate-900 leading-none">Catálogo de Telas</h1>
            
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
                    <button onClick={() => setSupplierMenuOpen(!isSupplierMenuOpen)} className={`w-11 h-11 flex items-center justify-center rounded-full border transition-all ${isSupplierMenuOpen || selectedSupplier || isRecentOnly ? 'bg-black text-white border-black' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`} title="Filtrar">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                    </button>
                    {isSupplierMenuOpen && (
                        <div className="absolute right-0 top-full mt-3 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 overflow-hidden animate-fade-in max-h-80 overflow-y-auto hide-scrollbar">
                            <div className="px-4 py-2 text-[10px] uppercase font-bold text-gray-400 tracking-wider border-b border-gray-50">FILTRAR</div>
                            
                            {/* RECIENTES INTEGRADO */}
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
                loading ? <div className="py-20 animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div> : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 xl:gap-8 w-full max-w-[1920px]">
                        {renderGridContent()}
                    </div>
                )
            )}
          </div>
        )}
        {view === 'detail' && selectedFabricId && (
          <FabricDetail fabric={fabrics.find(f => f.id === selectedFabricId)!} onBack={() => setView('grid')} onEdit={handleUpdateFabric} onDelete={handleDeleteFabric} />
        )}
      </main>

      {colorLightbox && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 md:p-8" onClick={() => setColorLightbox(null)}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
            <div className="absolute top-10 z-[110] flex gap-2">
                <button onClick={(e) => { e.stopPropagation(); goToDetailFromLightbox(); }} className="bg-black text-white px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/10">Ver Detalle de la tela</button>
            </div>
            <button onClick={(e) => handleGlobalNav(-1, e)} className="absolute left-2 md:left-8 text-white/80 p-3 z-[110] bg-black/20 rounded-full backdrop-blur-sm">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="relative z-[105] bg-white shadow-2xl rounded-sm w-[90vw] h-[90vw] md:w-[80vh] md:h-[80vh]" onClick={(e) => e.stopPropagation()}>
                 <img src={colorLightbox.image} className="w-full h-full object-contain" />
            </div>
            <button onClick={(e) => handleGlobalNav(1, e)} className="absolute right-2 md:right-8 text-white/80 p-3 z-[110] bg-black/20 rounded-full backdrop-blur-sm">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
            <button onClick={() => setColorLightbox(null)} className="absolute top-8 right-8 z-[110] text-white/70"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
      )}

      <UploadModal isOpen={isUploadModalOpen} onClose={() => setUploadModalOpen(false)} onSave={handleSaveFabric} onBulkSave={handleBulkSaveFabrics} onReset={handleReset} existingFabrics={fabrics} existingFurniture={furnitureTemplates} onSaveFurniture={handleSaveFurniture} onDeleteFurniture={handleDeleteFurniture} />
      <ChatBot fabrics={fabrics} />
    </div>
  );
}

export default App;
