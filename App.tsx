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

// Type for Sorting
type SortOption = 'color' | 'name' | 'model' | 'supplier';

function App() {
  const [view, setView] = useState<AppView>('grid');
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [selectedFabricId, setSelectedFabricId] = useState<string | null>(null);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'model' | 'color' | 'wood'>('model');
  const [loading, setLoading] = useState(true);
  
  // Sorting State - Default "color"
  const [sortBy, setSortBy] = useState<SortOption>('color');
  const [isFilterMenuOpen, setFilterMenuOpen] = useState(false);

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
      if (dbData && dbData.length > 0) {
        setFabrics(dbData);
      } else {
        // DO NOT LOAD INITIAL_FABRICS AUTOMATICALLY
        setFabrics([]); 
      }
    } catch (e: any) {
      console.error("Error loading initial data:", e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // Load initial data from Firestore
  useEffect(() => {
    loadData();
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
    try {
      // Optimistic Update
      setFabrics(prev => [newFabric, ...prev]);
      // Save to Firestore
      await saveFabricToFirestore(newFabric);
    } catch (e: any) {
      console.error("Error saving fabric:", e?.message || "Unknown error");
      // Optional: Revert state if needed, or just warn
    }
  };

  const handleBulkSaveFabrics = async (newFabrics: Fabric[]) => {
    try {
      // Optimistic Update
      setFabrics(prev => [...newFabrics, ...prev]);
      // Save to Firestore
      await saveBatchFabricsToFirestore(newFabrics);
    } catch (e: any) {
      console.error("Error bulk saving:", e?.message || "Unknown error");
    }
  };

  // Logic to update an existing fabric (from Edit Modal)
  const handleUpdateFabric = async (updatedFabric: Fabric) => {
    try {
      // Optimistic Update
      setFabrics(prev => prev.map(f => f.id === updatedFabric.id ? updatedFabric : f));
      // Save to Firestore
      await saveFabricToFirestore(updatedFabric);
    } catch (e: any) {
      console.error("Error updating fabric:", e?.message || "Unknown error");
    }
  };

  const handleDeleteFabric = async (fabricId: string) => {
      try {
          // Optimistic delete
          setFabrics(prev => prev.filter(f => f.id !== fabricId));
          setView('grid');
          setSelectedFabricId(null);
          await deleteFabricFromFirestore(fabricId);
      } catch (e: any) {
          console.error("Error deleting fabric:", e?.message || "Unknown error");
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
          } catch (e: any) {
            console.error("Error resetting collection:", e?.message || "Unknown error");
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

  /**
   * Helper function to determine sorting weight based on color name.
   * Higher value = Lighter/Cleaner. Lower value = Darker/Stronger.
   */
  const getColorWeight = (colorName: string): number => {
      const name = colorName.toLowerCase();
      
      // Whites / Lights (Highest priority)
      if (name.includes('white') || name.includes('snow') || name.includes('ivory') || name.includes('blanco') || name.includes('nieve')) return 100;
      if (name.includes('cream') || name.includes('bone') || name.includes('hueso') || name.includes('crema') || name.includes('pearl')) return 95;
      if (name.includes('natural') || name.includes('linen') || name.includes('lino') || name.includes('ecru') || name.includes('cotton')) return 90;
      
      // Light Neutrals
      if (name.includes('beige') || name.includes('sand') || name.includes('arena') || name.includes('oyster') || name.includes('flax')) return 85;
      if (name.includes('champagne') || name.includes('mist') || name.includes('fog')) return 80;

      // Greys / Silvers
      if (name.includes('silver') || name.includes('plata') || name.includes('platinum')) return 70;
      if (name.includes('light grey') || name.includes('pale')) return 65;
      if (name.includes('grey') || name.includes('gris') || name.includes('stone') || name.includes('piedra') || name.includes('zinc') || name.includes('pewter')) return 50;

      // Colors (Mid-range)
      if (name.includes('gold') || name.includes('yellow') || name.includes('mustard')) return 45;
      if (name.includes('orange') || name.includes('terra') || name.includes('brick')) return 40;
      if (name.includes('red') || name.includes('rose') || name.includes('pink') || name.includes('coral')) return 35;
      if (name.includes('green') || name.includes('olive') || name.includes('moss') || name.includes('emerald')) return 30;
      if (name.includes('blue') || name.includes('sky') || name.includes('aqua') || name.includes('teal')) return 25;

      // Darks / Strongs (Lowest priority)
      if (name.includes('navy') || name.includes('midnight') || name.includes('indigo') || name.includes('dark')) return 15;
      if (name.includes('charcoal') || name.includes('anthracite') || name.includes('slate') || name.includes('graphite')) return 10;
      if (name.includes('black') || name.includes('negro') || name.includes('ebony') || name.includes('onyx') || name.includes('caviar')) return 0;

      return 50; // Default for unknowns
  };

  const getFilteredItems = () => {
    let items = [...fabrics];
    if (searchQuery) {
        items = items.filter(f => 
            f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (f.colors || []).some(c => c.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }
    return items;
  };

  // Prepared items for rendering
  const renderGridContent = () => {
    let items = getFilteredItems();

    if (activeTab === 'wood') {
        return (
            <div className="text-center py-20 text-gray-400">
                <h3 className="font-serif text-xl italic">Colección de maderas próximamente</h3>
            </div>
        );
    }

    // --- MODEL VIEW ---
    if (activeTab === 'model') {
        // Models are sorted by Name by default in this view since filter is hidden
        items.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

        return items.map((fabric, idx) => (
            <FabricCard 
                key={fabric.id} 
                fabric={fabric}
                mode="model"
                onClick={() => handleFabricClick(fabric)}
                index={idx}
            />
        ));
    }

    // --- COLOR VIEW ---
    if (activeTab === 'color') {
        // Flatten all colors into a single array of objects
        const allColorCards = items.flatMap((fabric) => 
            (fabric.colors || []).map((colorName) => ({
                fabric,
                colorName
            }))
        );

        // Sort Logic for Individual Colors
        allColorCards.sort((a, b) => {
            if (sortBy === 'color') {
                // Lightest to Darkest
                const weightA = getColorWeight(a.colorName);
                const weightB = getColorWeight(b.colorName);
                return weightB - weightA; 
            }
            if (sortBy === 'name') {
                // Sort by Color Name (Abecedario)
                return a.colorName.localeCompare(b.colorName, 'es', { sensitivity: 'base' });
            }
            if (sortBy === 'model') {
                // Group by Model Name
                const modelCompare = a.fabric.name.localeCompare(b.fabric.name, 'es', { sensitivity: 'base' });
                if (modelCompare !== 0) return modelCompare;
                // Secondary sort by color name
                return a.colorName.localeCompare(b.colorName, 'es', { sensitivity: 'base' });
            }
            if (sortBy === 'supplier') {
                // Group by Supplier
                const suppCompare = a.fabric.supplier.localeCompare(b.fabric.supplier, 'es', { sensitivity: 'base' });
                if (suppCompare !== 0) return suppCompare;
                 return a.fabric.name.localeCompare(b.fabric.name, 'es', { sensitivity: 'base' });
            }
            return 0;
        });

        return allColorCards.map((item, idx) => (
            <FabricCard
                key={`${item.fabric.id}-${item.colorName}-${idx}`}
                fabric={item.fabric}
                mode="color"
                specificColorName={item.colorName}
                onClick={() => handleFabricClick(item.fabric, item.colorName)}
                index={idx}
            />
        ));
    }
  };

  const filteredItemCount = getFilteredItems().length;

  return (
    // Updated background color to match index.html (rgb(241, 242, 244))
    <div className="min-h-screen bg-[rgb(241,242,244)] text-primary font-sans selection:bg-black selection:text-white relative">
      
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
                    onClick={() => { setActiveTab('model'); setFilterMenuOpen(false); }}
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
                    onClick={() => { setActiveTab('wood'); setFilterMenuOpen(false); }}
                    className={`pb-2 text-sm font-medium tracking-wide uppercase transition-colors ${
                        activeTab === 'wood' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                    Ver maderas
                </button>
            </div>
            
            {/* SEARCH AND FILTER BAR */}
            <div className="flex flex-row items-center gap-3 w-full max-w-2xl relative">
                {/* Search Input */}
                <div className="relative flex-grow">
                  <input 
                    type="text" 
                    placeholder="Buscar..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-full py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-black placeholder-gray-400 transition-shadow hover:shadow-sm shadow-sm"
                  />
                  <svg className="absolute left-4 top-3.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>

                {/* Filter Button - ONLY VISIBLE IN COLOR TAB */}
                {activeTab === 'color' && (
                    <div className="relative">
                        <button 
                            onClick={() => setFilterMenuOpen(!isFilterMenuOpen)}
                            className={`w-11 h-11 flex items-center justify-center rounded-full border transition-all ${isFilterMenuOpen ? 'bg-black text-white border-black' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                            title="Filtrar colores"
                        >
                            {/* Sort Icon: Three lines decreasing width */}
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="4" y1="6" x2="20" y2="6"></line>
                                <line x1="4" y1="12" x2="16" y2="12"></line>
                                <line x1="4" y1="18" x2="10" y2="18"></line>
                            </svg>
                        </button>

                        {/* Dropdown Menu */}
                        {isFilterMenuOpen && (
                            <div className="absolute right-0 top-full mt-3 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 overflow-hidden animate-fade-in">
                                <div className="px-4 py-2 text-[10px] uppercase font-bold text-gray-400 tracking-wider">Ordenar Por</div>
                                <button 
                                    onClick={() => { setSortBy('color'); setFilterMenuOpen(false); }}
                                    className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${sortBy === 'color' ? 'text-black font-bold bg-gray-50' : 'text-gray-600'}`}
                                >
                                    <span>Color (Claro a Fuerte)</span>
                                    {sortBy === 'color' && <span className="text-black">•</span>}
                                </button>
                                <button 
                                    onClick={() => { setSortBy('name'); setFilterMenuOpen(false); }}
                                    className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${sortBy === 'name' ? 'text-black font-bold bg-gray-50' : 'text-gray-600'}`}
                                >
                                    <span>Nombre (A-Z)</span>
                                    {sortBy === 'name' && <span className="text-black">•</span>}
                                </button>
                                <button 
                                    onClick={() => { setSortBy('model'); setFilterMenuOpen(false); }}
                                    className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${sortBy === 'model' ? 'text-black font-bold bg-gray-50' : 'text-gray-600'}`}
                                >
                                    <span>Por Modelo</span>
                                    {sortBy === 'model' && <span className="text-black">•</span>}
                                </button>
                                <button 
                                    onClick={() => { setSortBy('supplier'); setFilterMenuOpen(false); }}
                                    className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${sortBy === 'supplier' ? 'text-black font-bold bg-gray-50' : 'text-gray-600'}`}
                                >
                                    <span>Por Proveedor</span>
                                    {sortBy === 'supplier' && <span className="text-black">•</span>}
                                </button>
                            </div>
                        )}
                        
                        {/* Backdrop to close menu */}
                        {isFilterMenuOpen && (
                            <div className="fixed inset-0 z-40" onClick={() => setFilterMenuOpen(false)}></div>
                        )}
                    </div>
                )}
            </div>
        </header>
      )}

      {/* Main Content */}
      <main>
        {view === 'grid' && (
          // Added 'flex flex-col items-center' to enforce centering of the grid container content
          <div className="container mx-auto px-6 pb-20 flex flex-col items-center">
            {loading ? (
                <div className="flex justify-center items-center py-20">
                   <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
                </div>
            ) : filteredItemCount === 0 && activeTab !== 'wood' ? (
                <div className="text-center py-20 text-gray-300">
                     <p>El catálogo está vacío o no se pudo cargar.</p>
                     <p className="text-xs mt-2 mb-4">Verifica tu conexión a internet.</p>
                     <button 
                        onClick={loadData}
                        className="bg-black text-white px-4 py-2 rounded-full text-sm font-bold hover:bg-gray-800"
                     >
                        Reintentar
                     </button>
                     <p className="text-xs mt-4">O usa el botón "." arriba a la derecha para cargar datos nuevos.</p>
                </div>
            ) : (
                // CHANGED: Limited max columns to 5 (2xl:grid-cols-5)
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-5 gap-6 xl:gap-8 w-full max-w-[1920px] justify-center">
                    {renderGridContent()}
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