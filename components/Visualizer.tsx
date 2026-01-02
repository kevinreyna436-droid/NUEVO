
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

  // --- RUG SELECTOR STATE ---
  const [isRugSelectorOpen, setIsRugSelectorOpen] = useState(false);
  const [isGeneratingScene, setIsGeneratingScene] = useState(false);

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
      
      if (isGenerating || isGeneratingScene) {
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

                  if (isGeneratingScene) {
                      if (next < 30) setProgressMessage('Preparando escenario y perspectivas...');
                      else if (next < 60) setProgressMessage('Colocando tapete con dimensiones personalizadas...');
                      else if (next < 85) setProgressMessage('Integrando sillón e iluminación...');
                      else setProgressMessage('Renderizando escena final...');
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
  }, [isGenerating, isGeneratingScene]);

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
        'rug': 'Tapete/Escena'
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
          const furnitureB64 = await ensureBase64(targetFurniture.imageUrl);
          
          // Buscar Tela
          const fabric = fabrics.find(f => f.id === selectedFabricId);
          const swatchRaw = (selectedColorName && fabric?.colorImages?.[selectedColorName]) 
            ? fabric.colorImages[selectedColorName] 
            : fabric?.mainImage;
          
          if (!swatchRaw) throw new Error("No se encontró la imagen de la tela. Asegúrate de que la tela seleccionada tenga foto.");
          const swatchB64 = await ensureBase64(swatchRaw);

          // LOGIC BRANCH: If category is RUG, use visualizeRoomScene
          if (targetFurniture.category === 'rug') {
             // For rugs:
             // furnitureB64 is the ROOM IMAGE (Scene)
             // swatchB64 is the RUG IMAGE
             // furnitureBase64 arg is undefined (no sofa yet)
             const dimensions = fabric?.dimensions || "";
             
             // Update progress messages for Scene Generation
             setIsGeneratingScene(true); // Trigger scene progress text
             
             const result = await visualizeRoomScene(furnitureB64, swatchB64, undefined, dimensions);
             
             setIsGeneratingScene(false);
             
             if (result) {
                setProgress(100);
                await new Promise(resolve => setTimeout(resolve, 600));
                setResultImage(result);
             }

          } else {
             // Standard Furniture Upholstery
             // Buscar Madera (Opcional)
             let woodB64: string | undefined = undefined;
             if (selectedWoodId && targetFurniture.category !== 'rug') {
                const wood = fabrics.find(f => f.id === selectedWoodId);
                if (wood && wood.mainImage) {
                    woodB64 = await ensureBase64(wood.mainImage);
                }
             }

             const result = await visualizeUpholstery(furnitureB64, swatchB64, woodB64);
             
             if (result) {
                 setProgress(100);
                 setProgressMessage('¡Renderizado Completo!');
                 await new Promise(resolve => setTimeout(resolve, 600));
                 setResultImage(result);
             }
          }

      } catch (error: any) {
          console.error("Error visualización:", error);
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
          setIsGeneratingScene(false); // Ensure this is reset
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
          // Reset selection
          setSelectedWoodId('');
          setStep(2);
      }
  };

  const handleViewOnRug = () => {
      // Abre el selector de tapetes en lugar de disparar una acción directa
      setIsRugSelectorOpen(true);
  };

  // --- NEW: HANDLE RUG SELECTION & SCENE GENERATION ---
  const handleRugSelected = async (rug: Fabric) => {
      setIsRugSelectorOpen(false);
      
      // We need a base room scene. 
      // Assumption: 'rug-01' in templates is the EMPTY ROOM.
      // If not, we try to find any template with category 'rug' or fallback to the first 'rug' fabric if it was uploaded as scene.
      // Better strategy: Look for the specific ID 'rug-01' or name containing "Vacía".
      const roomTemplate = templates.find(t => t.id === 'rug-01' || t.name.includes("Vacía") || t.category === 'rug');
      
      if (!roomTemplate) {
          alert("No se encontró una Escena Base (Habitación Vacía) configurada.");
          return;
      }
      
      if (!resultImage) {
          alert("Primero debes generar el mueble.");
          return;
      }

      setErrorMessage(null);
      setIsGeneratingScene(true);
      setResultImage(null); // Clear previous result to show loader
      setStep(3); // Ensure we are on result screen

      try {
           const roomB64 = await ensureBase64(roomTemplate.imageUrl);
           const rugB64 = await ensureBase64(rug.mainImage);
           
           // The "Furniture" for the scene is the Result Image we just generated
           // But since resultImage is already Base64 Data URL, we pass it directly (after stripping prefix inside ensureBase64 if needed, 
           // but our service handles Data URLs well usually. Let's make sure).
           const furnitureResultB64 = await ensureBase64(resultImage);

           const dimensions = rug.dimensions || "Standard"; // Pass manual dimensions

           const sceneResult = await visualizeRoomScene(roomB64, rugB64, furnitureResultB64, dimensions);
           
           if (sceneResult) {
               setProgress(100);
               await new Promise(resolve => setTimeout(resolve, 600));
               setResultImage(sceneResult);
           }

      } catch (error: any) {
          console.error("Error generating scene:", error);
          setErrorMessage("Error generando la escena: " + (error.message || "Intente nuevamente."));
      } finally {
          setIsGeneratingScene(false);
      }
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
  const rugTemplates = templates.filter(t => t.category === 'rug');
  // Available Rugs for Selector (Exclude the empty room template itself if it's mixed in fabrics, usually fabrics are raw rugs)
  const availableRugs = fabrics.filter(f => f.category === 'rug');

  return (
    <div className="container mx-auto px-4 md:px-6 pb-20 max-w-7xl animate-fade-in-up relative">
      
      <PinModal 
        isOpen={showPinModal} 
        onClose={() => setShowPinModal(false)} 
        onSuccess={() => { setIsEditMode(true); setShowPinModal(false); }} 
        requiredPin="1379"
      />

      {/* RUG SELECTOR BOTTOM SHEET / MODAL */}
      {isRugSelectorOpen && (
          <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex justify-center items-end md:items-center p-0 md:p-8 animate-fade-in">
              <div className="bg-white w-full max-w-3xl rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col max-h-[80vh] md:max-h-[700px] overflow-hidden animate-fade-in-up">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                      <div>
                          <h3 className="font-serif text-2xl font-bold text-slate-900">Selecciona un Tapete</h3>
                          <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">Para visualizar en la escena</p>
                      </div>
                      <button onClick={() => setIsRugSelectorOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                          <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
                      {availableRugs.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-4">
                              <svg className="w-16 h-16 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              <p className="text-sm font-bold">No hay tapetes cargados en el catálogo.</p>
                              <p className="text-xs">Usa el botón "." para subir tapetes.</p>
                          </div>
                      ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                              {availableRugs.map(rug => (
                                  <div 
                                      key={rug.id} 
                                      onClick={() => handleRugSelected(rug)}
                                      className="group cursor-pointer bg-white rounded-2xl shadow-sm hover:shadow-xl hover:scale-105 transition-all duration-300 overflow-hidden border border-gray-100 flex flex-col"
                                  >
                                      <div className="aspect-video overflow-hidden relative bg-gray-100">
                                          <img src={rug.mainImage} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={rug.name} />
                                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                              <span className="opacity-0 group-hover:opacity-100 bg-white text-black text-[10px] font-bold uppercase px-3 py-1 rounded-full shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-all">Seleccionar</span>
                                          </div>
                                      </div>
                                      <div className="p-4 flex flex-col gap-2 items-center">
                                          <h4 className="font-serif text-sm font-bold text-slate-900 truncate">{rug.name}</h4>
                                          <span className="px-3 py-1 bg-gray-100 rounded-lg text-[10px] font-bold uppercase text-gray-500 tracking-wider border border-gray-200">
                                              {rug.dimensions || 'Estándar'}
                                          </span>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}


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
                 {/* ... (Step 1 and 2 content remains largely same, just context) ... */}
                 {step === 1 && (
                    <div className="animate-fade-in relative">
                        {isEditMode && (
                            <h3 className="font-serif text-3xl mb-8 text-center text-slate-900">Selecciona un mueble para EDITAR</h3>
                        )}
                        
                        {/* SECTION: TELAS (Muebles) */}
                        <div className="mb-12">
                            <h4 className="font-serif text-2xl mb-6 text-slate-900 pl-4 border-l-4 border-black">
                                Telas
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

                        {/* SECTION: TAPETES (Single Large Card) */}
                        <div>
                            <h4 className="font-serif text-2xl mb-6 text-slate-900 pl-4 border-l-4 border-black">
                                Tapetes
                            </h4>
                            <div className="w-full flex justify-center">
                                {rugTemplates.map((item) => (
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
                                                Toque para previsualizar
                                            </p>
                                        </div>

                                        <span className="text-[9px] bg-black text-white px-3 py-1 rounded-full absolute top-4 right-4 shadow-md font-bold uppercase tracking-widest">{item.supplier || 'RUGS'}</span>
                                        
                                        {isEditMode && (
                                            <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full text-[10px] uppercase font-bold shadow-sm">
                                                Editar Foto Base
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
                                {selectedFurniture?.imageUrl ? (
                                    <img src={selectedFurniture.imageUrl} className={`w-full h-full ${selectedFurniture?.category === 'rug' ? 'object-cover' : 'object-contain'} drop-shadow-lg`} />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-300">Sin Imagen Base</div>
                                )}
                            </div>
                            
                            <button 
                                onClick={() => setStep(1)} 
                                className="w-full py-4 px-6 bg-white/40 hover:bg-white/60 rounded-full text-sm font-bold uppercase tracking-widest text-slate-900 transition-all flex items-center justify-center gap-3 backdrop-blur-md shadow-sm hover:shadow-lg border border-white/50"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                {selectedFurniture?.category === 'rug' ? 'Cambiar escena' : 'Cambiar de sillón'}
                            </button>
                        </div>

                        {/* Right Side: Fabric Selection */}
                        <div className="flex-1 flex flex-col space-y-8">
                            <div>
                                <h3 className="font-serif text-4xl mb-2 text-slate-900">2. Elige la textura</h3>
                                <p className="text-sm text-slate-600 font-medium">
                                    {selectedFurniture?.category === 'rug' 
                                        ? 'Selecciona el tapete que deseas visualizar.' 
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
                                    <option value="" className="text-slate-900">Selecciona el Modelo...</option>
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
                                            const isRug = selectedFurniture?.category === 'rug';
                                            
                                            return (
                                                <div key={idx} className="flex flex-col items-center gap-2 group mb-4">
                                                    <div 
                                                        onClick={() => setSelectedColorName(color)} 
                                                        className={`relative overflow-hidden cursor-pointer transition-all duration-300 shadow-lg 
                                                            ${isRug ? 'w-48 aspect-video rounded-xl' : 'w-28 h-28 md:w-32 md:h-32 rounded-[2rem]'}
                                                            ${isSelected ? 'ring-4 ring-offset-2 ring-offset-transparent ring-slate-900 scale-105 z-10' : 'hover:scale-105 hover:ring-2 hover:ring-slate-900/50'}`}
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
                                                    {isRug && activeFabric.dimensions && (
                                                        <span className="px-2 py-0.5 bg-gray-200 rounded-md text-[9px] font-bold uppercase text-gray-600 tracking-wider border border-gray-300">
                                                            {activeFabric.dimensions}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-40 flex items-center justify-center bg-white/30 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-sm italic">
                                    Selecciona un modelo arriba para ver sus colores
                                </div>
                            )}

                            {/* --- DYNAMIC WOOD SELECTOR --- */}
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
                                {!selectedSwatchUrl ? 'Esta tela no tiene foto' : 'Ver resultados'}
                            </button>
                        </div>
                    </div>
                 )}
            </div>
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
