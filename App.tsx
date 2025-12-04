import React, { useState, useEffect } from 'react';
import FabricCard from './components/FabricCard';
import FabricDetail from './components/FabricDetail';
import UploadModal from './components/UploadModal';
import ChatBot from './components/ChatBot';
import ImageGenModal from './components/ImageGenModal';
import { INITIAL_FABRICS } from './constants';
import { Fabric, AppView } from './types';
import { 
  getFabricsFromFirestore, 
  saveFabricToFirestore, 
  saveBatchFabricsToFirestore, 
  deleteFabricFromFirestore,
  clearFirestoreCollection 
} from './services/firebase';

function App() {
  const [view, setView] = useState<AppView>('grid');
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [selectedFabricId, setSelectedFabricId] = useState<string | null>(null);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'model' | 'color' | 'wood'>('model');
  const [loading, setLoading] = useState(true);

  // State for Color View Lightbox (Global Grid)
  const [colorLightbox, setColorLightbox] = useState<{
    isOpen: boolean;
    image: string;
    fabricId: string;
    colorName: string;
  } | null>(null);

  // Load initial data from Firestore
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const dbData = await getFabricsFromFirestore();
        if (dbData && dbData.length > 0) {
          setFabrics(dbData);
        } else {
          // DO NOT LOAD INITIAL_FABRICS AUTOMATICALLY
          // This ensures the app starts empty for real data entry
          setFabrics([]); 
        }
      } catch (e) {
        console.error("Error loading initial data:", e);
      } finally {
        setLoading(false);
      }
    };

    initData();
  }, []);

  const handleFabricClick = (fabric: Fabric, specificColor?: string) => {
    if (activeTab === 'model') {
        // Direct to detail page
        setSelectedFabricId(fabric.id);
        setView('detail');
    } else {
        // Open Lightbox for Color View
        const img = specificColor && fabric.colorImages?.[specificColor] 
            ? fabric.colorImages[specificColor] 
            : fabric.mainImage;
            
        setColorLightbox({
            isOpen: true,
            image: img,
            fabricId: fabric.id,
            colorName: specificColor || 'Unknown'
        });
    }
  };

  const handleSaveFabric = async (newFabric: Fabric) => {
    // Optimistic Update
    setFabrics(prev => [newFabric, ...prev]);
    // Save to Firestore
    await saveFabricToFirestore(newFabric);
  };

  const handleBulkSaveFabrics = async (newFabrics: Fabric[]) => {
      // Optimistic Update
      setFabrics(prev => [...newFabrics, ...prev]);
      // Save to Firestore
      await saveBatchFabricsToFirestore(newFabrics);
  };

  // Logic to update an existing fabric (from Edit Modal)
  const handleUpdateFabric = async (updatedFabric: Fabric) => {
    // Optimistic Update
    setFabrics(prev => prev.map(f => f.id === updatedFabric.id ? updatedFabric : f));
    // Save to Firestore
    await saveFabricToFirestore(updatedFabric);
  };

  const handleDeleteFabric = async (fabricId: string) => {
      // Confirmation moved to UI component (EditFabricModal)
      try {
          // Optimistic delete
          setFabrics(prev => prev.filter(f => f.id !== fabricId));
          setView('grid');
          setSelectedFabricId(null);
          // Fire and forget (or await if you prefer strict sync)
          await deleteFabricFromFirestore(fabricId);
      } catch (e) {
          alert("Hubo un error al eliminar la ficha.");
      }
  };

  // Full Reset
  const handleReset = async () => {
      if(window.confirm("¿Estás seguro de que quieres borrar TODA la información de la base de datos (Nube)? Esta acción no se puede deshacer.")) {
          try {
            setFabrics([]);
            await clearFirestoreCollection();
            setUploadModalOpen(false);
            alert("Catálogo reseteado correctamente en la nube.");
          } catch (e) {
            alert("Error al resetear la base de datos.");
          }
      }
  };

  const goToDetailFromLightbox = () => {
    if (colorLightbox) {
        setSelectedFabricId(colorLightbox.fabricId);
        setView('detail');
        setColorLightbox(null); // Close lightbox
    }
  };

  // Logic for Grid Rendering
  const getDisplayItems = () => {
    let items = [...fabrics]; // Copy to sort safely

    if (searchQuery) {
        items = items.filter(f => 
            f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (f.colors || []).some(c => c.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }

    // SORT ALPHABETICALLY BY NAME
    items.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

    if (activeTab === 'wood') return [];
    return items;
  };

  const displayItems = getDisplayItems();

  return (
    <div className="min-h-screen bg-[#f2f2f2] text-primary font-sans selection:bg-black selection:text-white relative">
      
      {/* Top Right Upload Button */}
      <button 
        onClick={() => setUploadModalOpen(true)}
        className="fixed top-4 right-4 z-50 text-gray-300 hover:text-black font-bold text-2xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white transition-colors"
        title="Subir Archivos / Gestionar"
      >
        .
      </button>

      {/* Header */}
      {view === 'grid' && (
        <header className="pt-16 pb-12 px-6 flex flex-col items-center space-y-8 animate-fade-in-down">
            <h1 className="font-serif text-6xl md:text-8xl font-bold text-center tracking-tight text-slate-900 leading-none">
                Catálogo de telas
            </h1>
            <div className="flex space-x-8 md:space-x-12 border-b border-transparent">
                <button 
                    onClick={() => setActiveTab('model')}
                    className={`pb-2 text-sm font-medium tracking-wide uppercase transition-colors ${
                        activeTab === 'model' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                    Ver modelos
                </button>
                <button 
                    onClick={() => setActiveTab('color')}
                    className={`pb-2 text-sm font-medium tracking-wide uppercase transition-colors ${
                        activeTab === 'color' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                    Ver colores
                </button>
                <button 
                    onClick={() => setActiveTab('wood')}
                    className={`pb-2 text-sm font-medium tracking-wide uppercase transition-colors ${
                        activeTab === 'wood' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                    Ver maderas
                </button>
            </div>
            <div className="relative w-full max-w-lg">
              <input 
                type="text" 
                placeholder="Buscar por nombre, código o composición..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-full py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-black placeholder-gray-400 transition-shadow hover:shadow-sm shadow-sm"
              />
              <svg className="absolute left-4 top-3.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
        </header>
      )}

      {/* Main Content */}
      <main>
        {view === 'grid' && (
          <div className="container mx-auto px-6 pb-20">
            {activeTab === 'wood' ? (
                <div className="text-center py-20 text-gray-400">
                    <h3 className="font-serif text-xl italic">Colección de maderas próximamente</h3>
                </div>
            ) : loading ? (
                <div className="flex justify-center items-center py-20">
                   <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
                </div>
            ) : displayItems.length === 0 ? (
                <div className="text-center py-20 text-gray-300">
                     <p>El catálogo está vacío.</p>
                     <p className="text-xs mt-2">Usa el botón "." arriba a la derecha para cargar datos.</p>
                </div>
            ) : (
                // CHANGED: Reduced number of columns to make cards larger (removed 5 cols option)
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 xl:gap-8">
                    {activeTab === 'model' 
                        ? displayItems.map((fabric, idx) => (
                            <FabricCard 
                                key={fabric.id} 
                                fabric={fabric}
                                mode="model"
                                onClick={() => handleFabricClick(fabric)}
                                index={idx}
                            />
                        ))
                        : displayItems.flatMap((fabric) => 
                             (fabric.colors || []).map((colorName, idx) => (
                                <FabricCard
                                    key={`${fabric.id}-${idx}`}
                                    fabric={fabric}
                                    mode="color"
                                    specificColorName={colorName}
                                    onClick={() => handleFabricClick(fabric, colorName)}
                                    index={idx}
                                />
                             ))
                        )
                    }
                </div>
            )}
          </div>
        )}

        {view === 'detail' && selectedFabricId && (
          <FabricDetail 
            fabric={fabrics.find(f => f.id === selectedFabricId)!} 
            onBack={() => setView('grid')}
            onEdit={handleUpdateFabric}
            onDelete={handleDeleteFabric}
          />
        )}
        
        {view === 'generator' && (
            <ImageGenModal onClose={() => setView('grid')} />
        )}
      </main>

      {/* Color View Lightbox Overlay */}
      {colorLightbox && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center">
            {/* Background: Transparent 70% white with Blur 70% (approx md/lg blur) */}
            <div 
                className="absolute inset-0 bg-white/70 backdrop-blur-xl transition-all duration-500"
                onClick={() => setColorLightbox(null)}
            ></div>
            
            {/* Top Button */}
            <div className="absolute top-10 z-[110] animate-fade-in-down">
                <button 
                    onClick={goToDetailFromLightbox}
                    className="bg-black text-white px-8 py-3 rounded-full text-sm font-bold uppercase tracking-widest shadow-xl hover:bg-gray-800 transition-transform hover:scale-105"
                >
                    Ver Detalle del Modelo
                </button>
            </div>

            {/* Large Image */}
            <div className="relative z-[105] p-8 max-w-4xl w-full h-full flex items-center justify-center pointer-events-none">
                 <img 
                    src={colorLightbox.image} 
                    alt={colorLightbox.colorName} 
                    className="max-h-[80vh] max-w-full object-contain shadow-2xl rounded-sm pointer-events-auto"
                 />
            </div>
            
            {/* Close Button (X) */}
            <button 
                onClick={() => setColorLightbox(null)}
                className="absolute top-10 right-10 z-[110] text-gray-400 hover:text-black"
            >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
      )}

      {/* Modals */}
      <UploadModal 
        isOpen={isUploadModalOpen} 
        onClose={() => setUploadModalOpen(false)} 
        onSave={handleSaveFabric} 
        onBulkSave={handleBulkSaveFabrics}
        onReset={handleReset}
      />

      <ChatBot />

    </div>
  );
}

export default App;