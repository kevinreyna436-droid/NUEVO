
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
  
  // State for Selection
  const [selectedFabricId, setSelectedFabricId] = useState<string>('');
  const [selectedColorName, setSelectedColorName] = useState<string>('');
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
    if (initialSelection) {
        const foundFabric = fabrics.find(f => 
            f.name.toLowerCase() === initialSelection.model.toLowerCase() && 
            (f.mainImage || (f.colors && f.colors.length > 0))
        );
        
        if (foundFabric) {
            setSelectedFabricId(foundFabric.id);
            setSelectedColorName(initialSelection.color);
            
            if (initialSelection.category) {
                 const targetTemplate = templates.find(t => t.category === initialSelection.category);
                 if (targetTemplate) {
                     setSelectedFurniture(targetTemplate);
                     setStep(2); 
                 } else {
                     setStep(1);
                 }
            } else {
                setStep(1); 
            }
        }
    }
  }, [initialSelection, fabrics, templates]);

  // PROGRESS BAR LOGIC
  useEffect(() => {
      let interval: any;
      if (isGenerating || isGeneratingScene) {
          setProgress(0);
          interval = setInterval(() => {
              setProgress((prev) => {
                  let increment = 0;
                  if (prev < 30) increment = Math.random() * 3 + 1;
                  else if (prev < 60) increment = Math.random() * 2;
                  else if (prev < 85) increment = Math.random() * 0.5;
                  else if (prev < 95) increment = 0.1;
                  
                  const next = Math.min(prev + increment, 98);
                  
                  if (isGeneratingScene) {
                      if (next < 30) setProgressMessage('Preparando escenario...');
                      else if (next < 60) setProgressMessage('Ajustando escala del tapete...');
                      else if (next < 85) setProgressMessage('Integrando iluminación...');
                      else setProgressMessage('Renderizando...');
                  } else {
                      if (next < 30) setProgressMessage('Analizando geometría...');
                      else if (next < 60) setProgressMessage('Aplicando textura...');
                      else if (next < 85) setProgressMessage('Renderizando luces...');
                      else setProgressMessage('Finalizando...');
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

  const toSentenceCase = (str: string) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  /**
   * Helper Updated: Returns FULL Data URI.
   */
  const ensureDataUri = async (input: string): Promise<string> => {
    if (!input) return "";
    if (input.startsWith('data:')) return input;
    
    const fetchBlob = async (url: string) => {
        try {
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) throw new Error(response.statusText);
            return response.blob();
        } catch (e) {
             const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
             const response = await fetch(proxyUrl);
             if (!response.ok) throw new Error("Proxy failed");
             return response.blob();
        }
    };

    try {
        const blob = await fetchBlob(input);
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("Failed to load image:", input, e);
        return ""; 
    }
  };

  const handleGenerate = async (furnitureOverride?: FurnitureTemplate) => {
      const targetFurniture = furnitureOverride || selectedFurniture;
      if (!targetFurniture) return;

      if (furnitureOverride) {
          setSelectedFurniture(furnitureOverride);
          if (furnitureOverride.category === 'rug') setSelectedWoodId('');
      }

      setErrorMessage(null);
      setIsGenerating(true);
      setResultImage(null);
      setStep(3); // Move to result view immediately

      try {
          const furnitureB64 = await ensureDataUri(targetFurniture.imageUrl);
          const fabric = fabrics.find(f => f.id === selectedFabricId);
          const swatchRaw = (selectedColorName && fabric?.colorImages?.[selectedColorName]) 
            ? fabric.colorImages[selectedColorName] 
            : fabric?.mainImage;
          
          if (!swatchRaw) throw new Error("No se encontró la imagen de la tela.");
          const swatchB64 = await ensureDataUri(swatchRaw);

          if (targetFurniture.category === 'rug') {
             setIsGeneratingScene(true);
             const dimensions = fabric?.dimensions || "";
             const result = await visualizeRoomScene(furnitureB64, swatchB64, undefined, dimensions);
             setIsGeneratingScene(false);
             if (result) {
                setProgress(100);
                await new Promise(r => setTimeout(r, 500));
                setResultImage(result);
             }
          } else {
             let woodB64: string | undefined = undefined;
             if (selectedWoodId && targetFurniture.category !== 'rug') {
                const wood = fabrics.find(f => f.id === selectedWoodId);
                if (wood && wood.mainImage) woodB64 = await ensureDataUri(wood.mainImage);
             }
             const result = await visualizeUpholstery(furnitureB64, swatchB64, woodB64);
             if (result) {
                 setProgress(100);
                 await new Promise(r => setTimeout(r, 500));
                 setResultImage(result);
             }
          }
      } catch (error: any) {
          console.error(error);
          setErrorMessage("Error de generación: " + error.message);
          setStep(3); 
      } finally {
          setIsGenerating(false);
          setIsGeneratingScene(false);
      }
  };

  const handleDownload = () => {
    if (resultImage) {
        const a = document.createElement('a');
        a.href = resultImage;
        a.download = `Creata_Render.png`;
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
          setSelectedWoodId('');
          setStep(2);
      }
  };

  const handleRugSelected = async (rug: Fabric) => {
      setIsRugSelectorOpen(false);
      const roomTemplate = templates.find(t => t.id === 'rug-01' || t.name.includes("Vacía") || t.category === 'rug');
      
      const baseRoom = (selectedFurniture?.category === 'rug') ? selectedFurniture : roomTemplate;

      if (!baseRoom || !resultImage) return;

      setIsGeneratingScene(true);
      try {
           const roomB64 = await ensureDataUri(baseRoom.imageUrl);
           const rugB64 = await ensureDataUri(rug.mainImage);
           
           let furnitureResultB64: string | undefined = undefined;
           if (selectedFurniture?.category !== 'rug') {
               furnitureResultB64 = await ensureDataUri(resultImage);
           }
           
           const sceneResult = await visualizeRoomScene(roomB64, rugB64, furnitureResultB64, rug.dimensions || "");
           if (sceneResult) setResultImage(sceneResult);
      } catch (e) {
          console.error(e);
          setErrorMessage("Error de escena: " + (e as Error).message);
      } finally {
          setIsGeneratingScene(false);
      }
  };

  // Helper vars
  const activeFabric = fabrics.find(f => f.id === selectedFabricId);
  const selectedSwatchUrl = (selectedColorName && activeFabric?.colorImages?.[selectedColorName]) 
    ? activeFabric.colorImages[selectedColorName] 
    : activeFabric?.mainImage;
  const furnitureSupplier = selectedFurniture?.supplier?.toUpperCase() || '';
  const availableWoods = fabrics.filter(f => f.category === 'wood' && (!furnitureSupplier || f.supplier.toUpperCase() === furnitureSupplier));
  const furnitureTemplates = templates.filter(t => t.category !== 'rug');
  const rugTemplates = templates.filter(t => t.category === 'rug');
  const availableRugs = fabrics.filter(f => f.category === 'rug');

  return (
    <div className="container mx-auto px-4 md:px-6 pb-20 max-w-7xl animate-fade-in-up relative">
      
      <PinModal 
        isOpen={showPinModal} 
        onClose={() => setShowPinModal(false)} 
        onSuccess={() => { setIsEditMode(true); setShowPinModal(false); }} 
        requiredPin="1379"
      />

      {/* RUG SELECTOR MODAL */}
      {isRugSelectorOpen && (
          <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex justify-center items-end md:items-center p-0 md:p-8 animate-fade-in">
              <div className="bg-white w-full max-w-4xl rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-fade-in-up">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                      <div>
                          <h3 className="font-serif text-2xl font-bold text-slate-900">Selecciona un Tapete</h3>
                          <p className="text-xs text-gray-400">Elige la base para tu escena</p>
                      </div>
                      <button onClick={() => setIsRugSelectorOpen(false)} className="p-2 hover:bg-gray-200 rounded-full">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                          {availableRugs.map(rug => (
                              <div key={rug.id} onClick={() => handleRugSelected(rug)} className="group cursor-pointer bg-white rounded-2xl shadow-sm hover:shadow-xl hover:scale-105 transition-all overflow-hidden border border-gray-100">
                                  <div className="aspect-video relative bg-gray-100 overflow-hidden">
                                      <img src={rug.mainImage} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={rug.name} />
                                  </div>
                                  <div className="p-4 flex flex-col gap-2">
                                      <h4 className="font-serif text-sm font-bold text-slate-900 truncate">{rug.name}</h4>
                                      <span className="self-start px-3 py-1 bg-gray-100 rounded-lg text-[10px] font-bold uppercase text-gray-500 tracking-wider border border-gray-200">
                                          {rug.dimensions || 'Estándar'}
                                      </span>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {showOriginalTexture && (previewImage || selectedSwatchUrl) && (
        <div className="fixed inset-0 z-[250] bg-black/90 flex items-center justify-center p-4 cursor-pointer" onClick={() => setShowOriginalTexture(false)}>
          <img src={previewImage || selectedSwatchUrl} className="max-w-full max-h-full rounded-lg shadow-2xl" alt="Textura" />
        </div>
      )}

      <div className="text-center mb-6">
        <h2 className="font-serif text-4xl md:text-5xl font-bold text-slate-900">Visualizador</h2>
        {isEditMode && <div className="inline-block bg-red-500 text-white px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4 mt-4 animate-pulse">Modo Edición</div>}
      </div>

      <div className="bg-[rgb(241,245,249)] text-slate-900 rounded-[2rem] shadow-2xl overflow-hidden min-h-[600px] border border-white/40 flex flex-col relative transition-all">
          
          {/* STEP 1 & 2: SELECTION */}
          {step < 3 && (
            <div className="w-full p-8 md:p-12 flex-1 flex flex-col">
                 
                 {/* STEP 1: FURNITURE GRID */}
                 {step === 1 && (
                    <div className="animate-fade-in relative space-y-12">
                        {/* Furniture */}
                        <div>
                            <h4 className="font-serif text-2xl mb-6 text-slate-900 pl-4 border-l-4 border-black">Telas (Muebles)</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                {furnitureTemplates.map((item) => (
                                    <div key={item.id} onClick={() => handleFurnitureClick(item)} className="cursor-pointer rounded-3xl border hover:border-black/20 bg-white/40 hover:bg-white/60 overflow-hidden group shadow-lg transition-all relative backdrop-blur-sm">
                                        <img src={item.imageUrl} className="w-full h-48 object-contain p-4 group-hover:scale-105 transition-transform duration-700" alt={item.name}/>
                                        <div className="absolute bottom-0 left-0 right-0 backdrop-blur-md p-3 text-center border-t border-black/5 bg-white/50">
                                            <h4 className="font-serif font-bold text-sm text-slate-900">{item.name}</h4>
                                            {isEditMode && <p className="text-[9px] uppercase font-bold text-red-600">Editar</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Rugs */}
                        <div>
                            <h4 className="font-serif text-2xl mb-6 text-slate-900 pl-4 border-l-4 border-black">Tapetes (Escenas)</h4>
                            <div className="w-full flex justify-center">
                                {rugTemplates.map((item) => (
                                    <div key={item.id} onClick={() => handleFurnitureClick(item)} className="w-[95%] md:w-[90%] aspect-[21/9] cursor-pointer rounded-3xl border hover:border-black/20 bg-white/40 hover:bg-white/60 overflow-hidden group shadow-xl transition-all relative backdrop-blur-sm">
                                        <img src={item.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" alt={item.name}/>
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                                        <div className="absolute bottom-6 left-6 text-white text-left">
                                            <h4 className="font-serif font-bold text-3xl text-shadow-lg">{item.name}</h4>
                                            <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-90 mt-1">Toque para previsualizar</p>
                                        </div>
                                        {isEditMode && <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full text-[10px] uppercase font-bold">Editar</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                 )}

                 {/* STEP 2: FABRIC / CONFIGURATION */}
                 {step === 2 && (
                    <div className="flex flex-col md:flex-row gap-12 h-full animate-fade-in">
                        <div className="w-full md:w-1/3 flex flex-col items-center">
                            <div className="aspect-square w-full bg-white rounded-3xl overflow-hidden border border-gray-100 mb-6 p-6 relative shadow-inner">
                                <img src={selectedFurniture?.imageUrl} className={`w-full h-full ${selectedFurniture?.category === 'rug' ? 'object-cover' : 'object-contain'}`} />
                            </div>
                            <button onClick={() => setStep(1)} className="w-full py-4 px-6 bg-white/40 hover:bg-white/60 rounded-full text-sm font-bold uppercase tracking-widest text-slate-900 transition-all flex items-center justify-center gap-3 border border-white/50">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                {selectedFurniture?.category === 'rug' ? 'Cambiar Escena' : 'Cambiar Mueble'}
                            </button>
                        </div>

                        <div className="flex-1 flex flex-col space-y-8">
                            <div>
                                <h3 className="font-serif text-4xl mb-2 text-slate-900">2. Elige la textura</h3>
                                <p className="text-sm text-slate-600 font-medium">
                                    {selectedFurniture?.category === 'rug' ? 'Selecciona el tapete:' : 'Selecciona una tela:'}
                                </p>
                            </div>
                            
                            <div className="relative">
                                <select value={selectedFabricId} onChange={(e) => { setSelectedFabricId(e.target.value); setSelectedColorName(''); }} className="w-full p-4 pl-6 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/20 font-serif text-xl text-slate-900 outline-none appearance-none cursor-pointer hover:bg-white/70">
                                    <option value="">Selecciona el Modelo...</option>
                                    {fabrics
                                        .filter(f => selectedFurniture?.category === 'rug' ? f.category === 'rug' : (f.category !== 'wood' && f.category !== 'rug'))
                                        .map(f => (
                                            <option key={f.id} value={f.id}>{f.name}</option>
                                    ))}
                                </select>
                            </div>

                            {selectedFabricId ? (
                                <div className="space-y-4 animate-fade-in flex-1">
                                    <p className="text-xs uppercase font-bold text-slate-500 tracking-[0.2em] border-b border-black/10 pb-2">Variantes</p>
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
                                                            ${isRug ? 'w-48 aspect-video rounded-xl' : 'w-28 h-28 rounded-[2rem]'}
                                                            ${isSelected ? 'ring-4 ring-offset-2 ring-slate-900 scale-105' : 'hover:scale-105'}`}
                                                    >
                                                        {imgUrl ? <img src={imgUrl} className="w-full h-full object-cover" alt={color} /> : <div className="w-full h-full bg-gray-200"></div>}
                                                        {imgUrl && (
                                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                                                                <button onClick={(e) => handleViewOriginal(imgUrl, e)} className="p-2 bg-white/90 rounded-full text-black hover:scale-110">
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className={`text-xs font-bold uppercase tracking-wider text-slate-900 ${isSelected ? 'font-extrabold' : ''}`}>{toSentenceCase(color)}</span>
                                                    {isRug && activeFabric.dimensions && (
                                                        <span className="px-3 py-1 bg-gray-200 rounded-lg text-[10px] font-bold uppercase text-gray-600 tracking-wider border border-gray-300 shadow-sm">
                                                            {activeFabric.dimensions}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-40 flex items-center justify-center bg-white/30 rounded-2xl border border-dashed border-slate-300 text-slate-500 italic">Selecciona un modelo arriba</div>
                            )}

                            {selectedFurniture?.category !== 'rug' && availableWoods.length > 0 && (
                                <div className="space-y-4 animate-fade-in pt-4 border-t border-black/5">
                                    <h3 className="font-serif text-3xl mb-2 text-slate-900">3. Acabado (Madera)</h3>
                                    <div className="flex flex-wrap gap-4 py-2">
                                        {availableWoods.map((wood) => (
                                            <div key={wood.id} onClick={() => setSelectedWoodId(selectedWoodId === wood.id ? '' : wood.id)} className={`cursor-pointer flex flex-col items-center gap-2 transition-all ${selectedWoodId === wood.id ? 'scale-105' : 'hover:scale-105 opacity-80'}`}>
                                                <div className={`w-20 h-20 rounded-full overflow-hidden border-2 ${selectedWoodId === wood.id ? 'border-slate-900 ring-2 ring-offset-2 ring-slate-900' : 'border-gray-200'}`}>
                                                    <img src={wood.mainImage} className="w-full h-full object-cover" />
                                                </div>
                                                <span className={`text-[10px] font-bold uppercase ${selectedWoodId === wood.id ? 'text-black' : 'text-gray-500'}`}>{wood.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button disabled={!selectedColorName || !selectedSwatchUrl} onClick={() => handleGenerate()} className="w-full bg-slate-