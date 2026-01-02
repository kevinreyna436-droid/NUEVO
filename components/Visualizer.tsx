
import React, { useState, useEffect } from 'react';
import { Fabric, FurnitureTemplate } from '../types';
import { visualizeUpholstery, visualizeRoomScene } from '../services/geminiService';
import PinModal from './PinModal';

interface VisualizerProps {
  fabrics: Fabric[];
  templates: FurnitureTemplate[];
  initialSelection?: { model: string; color: string; category?: string } | null;
  onEditFurniture?: (template: FurnitureTemplate) => void;
}

const Visualizer: React.FC<VisualizerProps> = ({ fabrics, templates, initialSelection, onEditFurniture }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedFurniture, setSelectedFurniture] = useState<FurnitureTemplate | null>(null);
  
  // CAMBIO CLAVE: Usamos ID en lugar de Nombre para evitar conflictos de duplicados
  const [selectedFabricId, setSelectedFabricId] = useState<string>('');
  const [selectedColorName, setSelectedColorName] = useState<string>('');
  
  // New: Wood Selection for Artex Furniture
  const [selectedWoodId, setSelectedWoodId] = useState<string>('');
  
  // New: Furniture Overlay (El sillón generado que se pondrá sobre el tapete)
  const [furnitureOverlay, setFurnitureOverlay] = useState<string | null>(null);

  // Generation & Progress State
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [showOriginalTexture, setShowOriginalTexture] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Admin / Edit Mode State
  const [showPinModal, setShowPinModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    checkApiKey();
    // Si viene una selección desde el Grid (Probar), buscamos la tela correcta
    if (initialSelection) {
        // Buscamos la tela que coincida con el nombre Y que tenga imagen (prioridad a la subida por el usuario)
        const foundFabric = fabrics.find(f => 
            f.name.toLowerCase() === initialSelection.model.toLowerCase() && 
            (f.mainImage || (f.colors && f.colors.length > 0))
        );
        
        if (foundFabric) {
            setSelectedFabricId(foundFabric.id);
            setSelectedColorName(initialSelection.color);
            
            // Logic to pre-select furniture based on category (e.g., 'rug')
            if (initialSelection.category) {
                 // Try to find a template matching category
                 const targetTemplate = templates.find(t => t.category === initialSelection.category);
                 if (targetTemplate) {
                     setSelectedFurniture(targetTemplate);
                     setStep(2); // Skip furniture selection if category is enforced
                 } else {
                     setStep(1);
                 }
            } else {
                setStep(1); 
            }
        }
    }
  }, [initialSelection, fabrics, templates]);

  // PROGRESS BAR SIMULATION LOGIC
  useEffect(() => {
      let interval: any;
      
      if (isGenerating) {
          setProgress(0);
          setProgressMessage('Conectando con Gemini 3 Pro...');
          
          interval = setInterval(() => {
              setProgress((prev) => {
                  let increment = 0;
                  if (prev < 30) increment = Math.random() * 3 + 1;
                  else if (prev < 60) increment = Math.random() * 2;
                  else if (prev < 85) increment = Math.random() * 0.5;
                  else if (prev < 95) increment = 0.1;
                  
                  const next = Math.min(prev + increment, 98);

                  // Dynamic messages based on context (Scene vs Furniture)
                  if (selectedFurniture?.category === 'rug') {
                      if (next < 30) setProgressMessage('Analizando estructura de la habitación...');
                      else if (next < 60) setProgressMessage('Calculando perspectiva del piso...');
                      else if (next < 85) setProgressMessage('Integrando tapete y sombras...');
                      else setProgressMessage('Renderizado de escena completa...');
                  } else {
                      if (next < 30) setProgressMessage('Analizando geometría 3D del mueble...');
                      else if (next < 60) setProgressMessage('Calculando física de la tela y arrugas...');
                      else if (next < 85) setProgressMessage('Ajustando iluminación y sombras...');
                      else setProgressMessage('Renderizado final de alta resolución...');
                  }

                  return next;
              });
          }, 200);
      } else {
          setProgress(0);
      }

      return () => clearInterval(interval);
  }, [isGenerating, selectedFurniture]);

  const checkApiKey = async () => {
    try {
      // @ts-ignore
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasKey(selected);
    } catch (e) {
      setHasKey(false);
    }
  };

  const handleOpenKeyDialog = async () => {
    // @ts-ignore
    await window.aistudio.openSelectKey();
    setHasKey(true);
    // Limpiar errores si se selecciona la llave exitosamente
    if (errorMessage && (errorMessage.includes("saturado") || errorMessage.includes("cuota") || errorMessage.includes("Key"))) {
        setErrorMessage(null);
    }
  };

  const toSentenceCase = (str: string) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  const getCategoryLabel = (cat: string) => {
    if (!cat) return 'Mueble';
    const map: Record<string, string> = {
        'sofa': 'Sofá',
        'chair': 'Silla',
        'armchair': 'Butaca',
        'bed': 'Cama',
        'rug': 'Escena / Habitación'
    };
    const lower = cat.toLowerCase();
    if (map[lower]) return map[lower];
    return cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
  };

  const ensureBase64 = async (input: string): Promise<string> => {
    if (!input) return "";
    if (input.startsWith('data:')) {
      return input.split(',')[1];
    }
    
    const fetchBlobAsBase64 = async (url: string) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const blob = await response.blob();
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const res = reader.result as string;
                resolve(res.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    try {
        const response = await fetch(input, { credentials: 'omit', mode: 'cors' });
        if (response.ok) {
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const res = reader.result as string;
                    resolve(res.split(',')[1]);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }
    } catch (e) {}

    try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(input)}`;
        return await fetchBlobAsBase64(proxyUrl);
    } catch (e) {}

    try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(input)}`;
        return await fetchBlobAsBase64(proxyUrl);
    } catch (e) {
        throw new Error("No se pudo descargar la imagen. Intenta usar una imagen local o subida manualmente.");
    }
  };

  const handleGenerate = async (furnitureOverride?: FurnitureTemplate) => {
      // REMOVIDO: Chequeo estricto de Key. Se confía en el error handler.

      const targetFurniture = furnitureOverride || selectedFurniture;
      if (!targetFurniture) return;

      if (furnitureOverride) {
          setSelectedFurniture(furnitureOverride);
          if (furnitureOverride.category === 'rug') {
            setSelectedWoodId('');
          }
      }

      setErrorMessage(null);
      setIsGenerating(true);
      setResultImage(null);
      setStep(3);

      try {
          // 1. Prepare Base Image (Furniture OR Room Scene)
          const baseB64 = await ensureBase64(targetFurniture.imageUrl);
          
          // 2. Prepare Fabric/Rug Texture
          const fabric = fabrics.find(f => f.id === selectedFabricId);
          const swatchRaw = (selectedColorName && fabric?.colorImages?.[selectedColorName]) 
            ? fabric.colorImages[selectedColorName] 
            : fabric?.mainImage;
          
          if (!swatchRaw) throw new Error("No se encontró la imagen de la tela. Asegúrate de que la tela seleccionada tenga foto.");
          const swatchB64 = await ensureBase64(swatchRaw);

          let result: string | null = null;

          // BRANCH LOGIC: SCENE VS UPHOLSTERY
          if (targetFurniture.category === 'rug') {
              // --- ROOM SCENE GENERATION ---
              // baseB64 = Room Image
              // swatchB64 = Rug Image
              // furnitureOverlay = Optional Furniture (from previous step)
              const overlayB64 = furnitureOverlay ? await ensureBase64(furnitureOverlay) : undefined;
              
              result = await visualizeRoomScene(baseB64, swatchB64, overlayB64);

          } else {
              // --- STANDARD FURNITURE UPHOLSTERY ---
              // Buscar Madera (Opcional)
              let woodB64: string | undefined = undefined;
              if (selectedWoodId && targetFurniture.category !== 'rug') {
                 const wood = fabrics.find(f => f.id === selectedWoodId);
                 if (wood && wood.mainImage) {
                     woodB64 = await ensureBase64(wood.mainImage);
                 }
              }

              result = await visualizeUpholstery(baseB64, swatchB64, woodB64);
          }
          
          if (result) {
              setProgress(100);
              setProgressMessage('¡Renderizado Completo!');
              await new Promise(resolve => setTimeout(resolve, 600));
              setResultImage(result);
          }

      } catch (error: any) {
          console.error("Error visualización Pro:", error);
          const errorText = error?.message || JSON.stringify(error);
          
          const isOverloaded = errorText.includes('503') || errorText.includes('overloaded') || errorText.includes('UNAVAILABLE');
          const isQuotaLimit = errorText.includes('429') || errorText.includes('exhausted') || errorText.includes('limit') || errorText.includes('RESOURCE_EXHAUSTED');
          const isKeyError = errorText.includes('API key') || errorText.includes('unauthorized') || errorText.includes('403');

          if (isQuotaLimit || isKeyError) {
              setErrorMessage("⚠️ Límite de Cuota o Falta de Key: El modelo 'Gemini 3 Pro' requiere una cuenta facturable o una Key válida.");
          } else if (isOverloaded) {
              setErrorMessage("⚠️ Motor Saturado: El servicio público está muy ocupado. Usa una Key Privada para prioridad.");
          } else {
              setErrorMessage("Error técnico: " + errorText.substring(0, 100));
          }
      } finally {
          setIsGenerating(false);
      }
  };

  const handleDownload = () => {
    if (resultImage) {
        const a = document.createElement('a');
        a.href = resultImage;
        const fabricName = fabrics.find(f => f.id === selectedFabricId)?.name || 'Tela';
        a.download = `Creata_Visualizer_${fabricName}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
  };

  const handleViewOriginal = (imgUrl: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setPreviewImage(imgUrl);
      setShowOriginalTexture(true);
  };

  const handleFurnitureClick = (item: FurnitureTemplate) => {
      if (isEditMode && onEditFurniture) {
          onEditFurniture(item);
      } else {
          setSelectedFurniture(item);
          // Reset specific selections but KEEP furnitureOverlay if we are switching to Rug Scene
          if (item.category !== 'rug') {
              setFurnitureOverlay(null); // Reset overlay if picking a new furniture
          }
          setSelectedWoodId('');
          setStep(2);
      }
  };

  // --- NEW: LOGIC FOR "VER EN TAPETE" ---
  const handleViewOnRug = () => {
      if (!resultImage) return;

      // 1. Find the Room Scene Template
      // The default template for room scene is 'rug-01' or category 'rug'
      const roomTemplate = templates.find(t => t.category === 'rug');
      
      if (!roomTemplate) {
          alert("No se encontró una 'Escena de Habitación' configurada en el sistema. Sube una imagen de habitación en 'Carga Masiva' -> 'Escenas'.");
          return;
      }

      // 2. Save current result as the overlay for the next step
      setFurnitureOverlay(resultImage);

      // 3. Set Context to Room Scene
      setSelectedFurniture(roomTemplate);

      // 4. Reset Fabric Selection (User must now pick a Rug)
      setSelectedFabricId('');
      setSelectedColorName('');
      
      // 5. Go to Step 2 (Select Texture - Rugs)
      setStep(2);
  };

  // CAMBIO: Buscar por ID
  const activeFabric = fabrics.find(f => f.id === selectedFabricId);
  const selectedSwatchUrl = (selectedColorName && activeFabric?.colorImages?.[selectedColorName]) 
    ? activeFabric.colorImages[selectedColorName] 
    : activeFabric?.mainImage;
    
  // LOGIC FOR MATCHING PROVIDERS (Filtra las maderas según el proveedor del mueble)
  const furnitureSupplier = selectedFurniture?.supplier?.toUpperCase() || '';
  
  const availableWoods = fabrics.filter(f => {
      // 1. Debe ser categoría madera
      if (f.category !== 'wood') return false;
      
      // 2. Si el mueble tiene proveedor, solo mostrar maderas de ese proveedor
      if (furnitureSupplier) {
          return f.supplier.toUpperCase() === furnitureSupplier;
      }
      
      // 3. Si el mueble no tiene proveedor (internal), mostrar todas las maderas o maderas sin proveedor específico
      return true; 
  });

  const furnitureTemplates = templates.filter(t => t.category !== 'rug');
  // Use 'rug' category templates as Room Scenes
  const roomTemplates = templates.filter(t => t.category === 'rug');

  return (
    <div className="container mx-auto px-4 md:px-6 pb-20 max-w-7xl animate-fade-in-up relative">
      
      <PinModal 
        isOpen={showPinModal} 
        onClose={() => setShowPinModal(false)} 
        onSuccess={() => { setIsEditMode(true); setShowPinModal(false); }} 
        requiredPin="1379"
      />

      {showOriginalTexture && (previewImage || selectedSwatchUrl) && (
        <div 
          className="fixed inset-0 z-[250] bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setShowOriginalTexture(false)}
        >
          <img src={previewImage || selectedSwatchUrl} className="max-w-full max-h-full rounded-lg shadow-2xl" alt="Textura original" />
          <button className="absolute top-6 right-6 text-white/70 hover:text-white">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      <div className="text-center mb-6">
        <h2 className="font-serif text-4xl md:text-5xl font-bold text-slate-900">Visualizador</h2>
        
        {isEditMode && (
             <div className="inline-block bg-red-500 text-white px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4 animate-pulse mt-4">
                 Modo Edición Activado: Selecciona un mueble para editar
             </div>
        )}
      </div>

      <div className="bg-[rgb(241,245,249)] text-slate-900 rounded-[2rem] shadow-2xl overflow-hidden min-h-[600px] border border-white/40 flex flex-col md:flex-row transition-colors duration-500 relative">
          
          {step < 3 && (
            <div className="w-full p-8 md:p-12">
                 {step === 1 && (
                    <div className="animate-fade-in relative">
                        {isEditMode && (
                            <h3 className="font-serif text-3xl mb-8 text-center text-slate-900">Selecciona un mueble para EDITAR</h3>
                        )}
                        
                        {/* SECTION: TELAS (Muebles) */}
                        <div className="mb-12">
                            <h4 className="font-serif text-2xl mb-6 text-slate-900 pl-4 border-l-4 border-black">
                                Muebles
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                {furnitureTemplates.map((item) => (
                                    <div 
                                        key={item.id} 
                                        onClick={() => handleFurnitureClick(item)} 
                                        className={`cursor-pointer rounded-3xl border hover:border-black/20 bg-white/40 hover:bg-white/60 overflow-hidden group shadow-lg transition-all relative backdrop-blur-sm ${isEditMode ? 'border-red-400 ring-2 ring-red-400/50' : 'border-black/5'}`}
                                    >
                                        <img 
                                        src={item.imageUrl} 
                                        className="w-full h-48 object-contain p-4 group-hover:scale-105 transition-transform duration-700" 
                                        alt={item.name}
                                        />
                                        <div className={`absolute bottom-0 left-0 right-0 backdrop-blur-md p-3 text-center border-t border-black/5 ${isEditMode ? 'bg-red-500/20' : 'bg-white/50'}`}>
                                            <h4 className="font-serif font-bold text-sm text-slate-900 line-clamp-1">{item.name}</h4>
                                            
                                            {isEditMode && (
                                                <p className="text-[9px] uppercase font-bold text-red-600">Editar</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* SECTION: SCENES (Previously Rugs) */}
                        <div>
                            <h4 className="font-serif text-2xl mb-6 text-slate-900 pl-4 border-l-4 border-black">
                                Escenas y Habitaciones
                            </h4>
                            <div className="w-full flex justify-center">
                                {roomTemplates.map((item) => (
                                    <div 
                                        key={item.id} 
                                        onClick={() => handleFurnitureClick(item)} 
                                        className={`w-[95%] md:w-[90%] aspect-[16/9] md:aspect-[21/9] cursor-pointer rounded-3xl border hover:border-black/20 bg-white/40 hover:bg-white/60 overflow-hidden group shadow-xl transition-all relative backdrop-blur-sm ${isEditMode ? 'border-red-400 ring-2 ring-red-400/50' : 'border-black/5'}`}
                                    >
                                        <img 
                                        src={item.imageUrl} 
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" 
                                        alt={item.name}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                                        
                                        <div className="absolute bottom-6 left-6 text-white text-left">
                                            <h4 className="font-serif font-bold text-2xl md:text-3xl text-shadow-lg">{item.name}</h4>
                                            <p className="text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] opacity-90 mt-1">
                                                Visualizar tapete aquí
                                            </p>
                                        </div>
                                        
                                        {isEditMode && (
                                            <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full text-[10px] uppercase font-bold shadow-sm">
                                                Editar Escena
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                 )}

                 {step === 2 && (
                    <div className="flex flex-col md:flex-row gap-12 h-full animate-fade-in">
                        {/* Left Side: Furniture */}
                        <div className="w-full md:w-1/3 flex flex-col items-center">
                            <div className="aspect-square w-full bg-white rounded-3xl overflow-hidden border border-gray-100 mb-6 p-6 relative shadow-inner">
                                <img src={selectedFurniture?.imageUrl} className={`w-full h-full ${selectedFurniture?.category === 'rug' ? 'object-cover' : 'object-contain'} drop-shadow-lg`} />
                                
                                {/* Overlay Indicator */}
                                {furnitureOverlay && (
                                    <div className="absolute bottom-4 right-4 bg-black/80 text-white text-[10px] font-bold uppercase px-3 py-1 rounded-full shadow-lg border border-white/20">
                                        + Sillón Incluido
                                    </div>
                                )}
                            </div>
                            
                            <button 
                                onClick={() => { setStep(1); setFurnitureOverlay(null); }} 
                                className="w-full py-4 px-6 bg-white/40 hover:bg-white/60 rounded-full text-sm font-bold uppercase tracking-widest text-slate-900 transition-all flex items-center justify-center gap-3 backdrop-blur-md shadow-sm hover:shadow-lg border border-white/50"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                {selectedFurniture?.category === 'rug' ? 'Cambiar Escena' : 'Cambiar Mueble'}
                            </button>
                        </div>

                        {/* Right Side: Fabric Selection */}
                        <div className="flex-1 flex flex-col space-y-8">
                            <div>
                                <h3 className="font-serif text-4xl mb-2 text-slate-900">
                                    {selectedFurniture?.category === 'rug' ? '2. Elige el Tapete' : '2. Elige la Tela'}
                                </h3>
                                <p className="text-sm text-slate-600 font-medium">
                                    {selectedFurniture?.category === 'rug' 
                                        ? 'Selecciona el diseño del tapete que deseas colocar en el piso.' 
                                        : 'Selecciona una tela para ver cómo quedaría.'}
                                </p>
                            </div>
                            
                            {/* Model Selector (BY ID NOW) */}
                            <div className="relative">
                                <select 
                                    value={selectedFabricId} 
                                    onChange={(e) => { setSelectedFabricId(e.target.value); setSelectedColorName(''); }} 
                                    className="w-full p-4 pl-6 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/20 focus:ring-2 focus:ring-black/20 font-serif text-xl text-slate-900 outline-none appearance-none cursor-pointer hover:bg-white/70 transition-colors"
                                >
                                    <option value="" className="text-slate-900">
                                        {selectedFurniture?.category === 'rug' ? 'Selecciona Tapete...' : 'Selecciona Modelo...'}
                                    </option>
                                    {fabrics
                                        // Filtra telas vs tapetes según la selección actual
                                        .filter(f => selectedFurniture?.category === 'rug' ? f.category === 'rug' : (f.category !== 'wood' && f.category !== 'rug'))
                                        // Priorizar visualmente las que tienen imágenes
                                        .sort((a,b) => {
                                            const aHasImg = !!a.mainImage;
                                            const bHasImg = !!b.mainImage;
                                            if (aHasImg && !bHasImg) return -1;
                                            if (!aHasImg && bHasImg) return 1;
                                            return a.name.localeCompare(b.name);
                                        })
                                        .map(f => (
                                            <option key={f.id} value={f.id} className="text-slate-900">
                                                {f.name} {!f.mainImage ? '(Sin Foto)' : ''}
                                            </option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-600">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </div>
                            </div>

                            {selectedFabricId ? (
                                <div className="space-y-4 animate-fade-in flex-1">
                                    <div className="flex justify-between items-end border-b border-black/10 pb-2">
                                        <p className="text-xs uppercase font-bold text-slate-500 tracking-[0.2em]">Variantes Disponibles</p>
                                        {selectedColorName && (
                                            <p className="text-sm font-serif font-bold text-slate-900 animate-fade-in">{toSentenceCase(selectedColorName)}</p>
                                        )}
                                    </div>
                                    
                                    {/* Variants Grid */}
                                    <div className="flex flex-wrap gap-6 py-4 justify-start">
                                        {activeFabric?.colors.map((color, idx) => {
                                            const imgUrl = activeFabric.colorImages?.[color] || activeFabric.mainImage;
                                            const isSelected = selectedColorName === color;
                                            
                                            return (
                                                <div key={idx} className="flex flex-col items-center gap-2 group mb-4">
                                                    <div 
                                                        onClick={() => setSelectedColorName(color)} 
                                                        className={`relative w-28 h-28 md:w-32 md:h-32 rounded-[2rem] cursor-pointer transition-all duration-300 shadow-lg overflow-hidden ${isSelected ? 'ring-4 ring-offset-2 ring-offset-transparent ring-slate-900 scale-105 z-10' : 'hover:scale-105 hover:ring-2 hover:ring-slate-900/50'}`}
                                                    >
                                                        {imgUrl ? (
                                                            <img src={imgUrl} className="w-full h-full object-cover" alt={color} />
                                                        ) : (
                                                            <div className="w-full h-full bg-gray-200 flex items-center justify-center text-xs text-gray-400 font-bold">Sin Foto</div>
                                                        )}
                                                        
                                                        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/60 to-transparent"></div>
                                                        
                                                        <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${isSelected ? 'bg-black/20' : 'bg-black/0 group-hover:bg-black/20'}`}>
                                                            {imgUrl && (
                                                                <button 
                                                                    onClick={(e) => handleViewOriginal(imgUrl, e)}
                                                                    className={`p-2 bg-white/90 backdrop-blur-md rounded-full text-black hover:scale-110 transition-all transform ${isSelected ? 'scale-100 opacity-100' : 'scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100'}`}
                                                                    title="Ver textura original"
                                                                >
                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <span className={`text-xs font-bold uppercase tracking-wider text-slate-900 transition-opacity ${isSelected ? 'opacity-100 font-extrabold' : 'opacity-70 group-hover:opacity-100'}`}>
                                                        {toSentenceCase(color)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-40 flex items-center justify-center bg-white/30 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-sm italic">
                                    {selectedFurniture?.category === 'rug' ? 'Selecciona un tapete arriba' : 'Selecciona un modelo arriba'}
                                </div>
                            )}

                            {/* --- DYNAMIC WOOD SELECTOR BASED ON PROVIDER (Only for Furniture, not Rugs) --- */}
                            {selectedFurniture?.category !== 'rug' && availableWoods.length > 0 && (
                                <div className="space-y-4 animate-fade-in pt-4 border-t border-black/5">
                                    <h3 className="font-serif text-3xl mb-2 text-slate-900">3. Elige el acabado (Madera)</h3>
                                    <div className="flex justify-between items-center">
                                        <p className="text-sm text-slate-600 font-medium">Mostrando acabados de: <span className="font-bold">{furnitureSupplier || 'GENÉRICO'}</span></p>
                                    </div>
                                    
                                    <div className="flex flex-wrap gap-4 py-2">
                                        {availableWoods.map((wood) => (
                                            <div 
                                                key={wood.id}
                                                onClick={() => setSelectedWoodId(selectedWoodId === wood.id ? '' : wood.id)}
                                                className={`cursor-pointer flex flex-col items-center gap-2 transition-all ${selectedWoodId === wood.id ? 'scale-105' : 'hover:scale-105 opacity-80'}`}
                                            >
                                                <div className={`w-20 h-20 rounded-full overflow-hidden border-2 shadow-sm ${selectedWoodId === wood.id ? 'border-slate-900 ring-2 ring-offset-2 ring-slate-900' : 'border-gray-200'}`}>
                                                    <img src={wood.mainImage} className="w-full h-full object-cover" alt={wood.name} />
                                                </div>
                                                <span className={`text-[10px] font-bold uppercase ${selectedWoodId === wood.id ? 'text-black' : 'text-gray-500'}`}>
                                                    {wood.name}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button 
                                disabled={!selectedColorName || !selectedSwatchUrl} 
                                onClick={() => handleGenerate()} 
                                className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold uppercase tracking-[0.2em] text-xs shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] hover:shadow-xl hover:bg-black transition-all mt-auto"
                            >
                                {!selectedSwatchUrl ? 'Esta selección no tiene foto' : (
                                    furnitureOverlay 
                                      ? 'Generar Escena Completa (Sillón + Tapete)' 
                                      : 'Ver resultados'
                                )}
                            </button>
                        </div>
                    </div>
                 )}
            </div>
          )}

          {step === 3 && (
            <>
                {/* Result Area */}
                <div className="w-full md:w-[65%] relative flex items-center justify-center overflow-hidden min-h-[500px]">
                     {isGenerating ? (
                        <div className="text-center z-10 p-10 w-full max-w-md animate-fade-in flex flex-col items-center">
                            <div className="relative w-full h-4 bg-gray-200 rounded-full overflow-hidden shadow-inner mb-6">
                                <div 
                                    className="absolute top-0 left-0 h-full bg-slate-900 transition-all duration-300 ease-out"
                                    style={{ width: `${progress}%` }}
                                ></div>
                                <div className="absolute top-0 left-0 h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]"></div>
                            </div>
                            
                            <div className="flex justify-between w-full mb-2 px-1">
                                <span className="text-xs font-bold uppercase text-slate-900 tracking-widest animate-pulse">
                                    {progressMessage}
                                </span>
                                <span className="text-xs font-bold text-slate-500">
                                    {Math.round(progress)}%
                                </span>
                            </div>
                            
                            <p className="text-[10px] text-slate-400 mt-4 uppercase tracking-[0.2em] font-medium text-center">
                                Componiendo escena con Gemini 3 Pro
                            </p>
                        </div>
                     ) : errorMessage ? (
                        <div className="text-center p-10 max-w-md animate-fade-in bg-white/60 backdrop-blur-md rounded-3xl border border-white/50 shadow-xl">
                            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600 border border-red-500/20">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            </div>
                            <h3 className="font-serif text-xl font-bold text-slate-900 mb-4">¡Atención!</h3>
                            <p className="text-sm text-slate-600 mb-8 leading-relaxed">
                                {errorMessage}
                            </p>
                            
                            <div className="flex flex-col gap-3">
                                <button 
                                    onClick={handleOpenKeyDialog}
                                    className="bg-blue-600 text-white px-8 py-4 rounded-full text-xs font-bold uppercase tracking-widest hover:scale-105 transition-transform shadow-lg shadow-blue-900/50 flex items-center justify-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                                    Activar Motor Privado
                                </button>
                                
                                <button 
                                    onClick={() => handleGenerate()} 
                                    className="bg-slate-900 text-white px-8 py-4 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-black transition-colors mt-2"
                                >
                                    Intentar nuevamente
                                </button>
                                
                                <button onClick={() => setStep(2)} className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors pt-2">Volver a Selección</button>
                            </div>
                        </div>
                     ) : resultImage ? (
                        <img src={resultImage} alt="Render Final" className="w-full h-full object-contain md:object-cover animate-fade-in" />
                     ) : null}
                </div>

                {/* Info Panel */}
                <div className="w-full md:w-[35%] bg-[rgb(241,245,249)] flex flex-col items-center text-center p-8 md:p-10 z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.1)] transition-colors duration-500 text-slate-900">
                    <div className="w-full border-b border-black/10 pb-6 mb-8">
                        <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Resultado Generado</h3>
                    </div>

                    <div className="flex-1 w-full flex flex-col items-center justify-center space-y-8">
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 tracking-[0.2em] mb-2">
                                {getCategoryLabel(selectedFurniture?.category || '')}
                            </p>
                            <h2 className="font-serif text-3xl text-slate-900 leading-none">
                                {toSentenceCase(selectedFurniture?.name || 'Mueble')}
                            </h2>
                        </div>

                        <div className="w-full relative">
                             <div className="w-12 h-px bg-black/10 mx-auto mb-8"></div>
                             
                             <div className="mb-6 relative group inline-block">
                                <p className="text-[10px] font-bold uppercase text-slate-500 tracking-[0.2em] mb-4">
                                    {selectedFurniture?.category === 'rug' ? 'Tapete Aplicado' : 'Tapizado con'}
                                </p>
                                <div 
                                    onClick={() => { setPreviewImage(selectedSwatchUrl || null); setShowOriginalTexture(true); }}
                                    className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-white shadow-xl cursor-pointer hover:scale-110 transition-transform duration-300 mx-auto group"
                                >
                                    <img src={selectedSwatchUrl || ''} className="w-full h-full object-cover" alt="Swatch" />
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg>
                                    </div>
                                </div>
                             </div>

                             <div className="mb-4">
                                <p className="text-[10px] font-bold uppercase text-slate-500 tracking-[0.2em] mb-1">Modelo</p>
                                <h2 className="font-serif text-3xl text-slate-900 leading-tight">
                                    {toSentenceCase(activeFabric?.name || 'Tela')}
                                </h2>
                             </div>
                             
                             <div>
                                <p className="text-[10px] font-bold uppercase text-slate-500 tracking-[0.2em] mb-1">Color / Variante</p>
                                <p className="text-xl font-serif italic text-slate-600">
                                    {toSentenceCase(selectedColorName)}
                                </p>
                             </div>

                             {selectedWoodId && (
                                 <div className="mt-4 pt-4 border-t border-black/5">
                                    <p className="text-[10px] font-bold uppercase text-slate-500 tracking-[0.2em] mb-1">Acabado Madera</p>
                                    <p className="text-lg font-serif italic text-slate-600">
                                        {fabrics.find(f => f.id === selectedWoodId)?.name}
                                    </p>
                                 </div>
                             )}
                        </div>
                    </div>

                    <div className="w-full space-y-3 mt-8 pt-8 border-t border-black/10">
                        {/* New: VER EN TAPETE Button (Only visible if we just generated a furniture, NOT a rug scene) */}
                        {selectedFurniture?.category !== 'rug' && resultImage && (
                            <button 
                                onClick={handleViewOnRug}
                                className="w-full bg-white text-slate-900 border border-slate-200 py-4 rounded-full font-bold uppercase tracking-[0.15em] text-[10px] shadow-sm hover:bg-gray-50 hover:border-black transition-all mb-2 flex items-center justify-center gap-2 group"
                            >
                                <svg className="w-4 h-4 text-gray-400 group-hover:text-black transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                Ver en tapete (Total Look)
                            </button>
                        )}

                        <button 
                            onClick={handleDownload}
                            disabled={!resultImage}
                            className="w-full bg-slate-900 text-white py-4 rounded-full font-bold uppercase tracking-[0.15em] text-[10px] shadow-lg hover:bg-black hover:scale-105 transition-all disabled:opacity-50"
                        >
                            Descargar Imagen
                        </button>
                        <button 
                            onClick={() => setStep(2)}
                            className="w-full bg-transparent text-slate-900 border border-slate-900/20 py-4 rounded-full font-bold uppercase tracking-[0.15em] text-[10px] hover:bg-black/5 transition-colors"
                        >
                            Cambiar Textura
                        </button>
                    </div>
                </div>
            </>
          )}

           {!isEditMode && step === 1 && (
              <button 
                onClick={(e) => { e.stopPropagation(); setShowPinModal(true); }}
                className="absolute bottom-6 right-6 w-8 h-8 bg-white/30 hover:bg-white/60 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 transition-all font-bold text-xl cursor-pointer z-50 backdrop-blur-sm shadow-sm"
                title="Administrar Muebles (Editar)"
              >
                .
              </button>
          )}

           {isEditMode && step === 1 && (
               <button
                  onClick={() => setIsEditMode(false)}
                  className="absolute bottom-4 right-4 text-xs font-bold uppercase text-red-500 hover:text-red-700 bg-white/50 px-3 py-1 rounded-full z-50"
               >
                  Salir Edición
               </button>
           )}
      </div>
    </div>
  );
};

export default Visualizer;
