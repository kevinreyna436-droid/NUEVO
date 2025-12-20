
import React, { useState, useEffect } from 'react';
import { Fabric, FurnitureTemplate } from '../types';
import { visualizeUpholstery } from '../services/geminiService';

interface VisualizerProps {
  fabrics: Fabric[];
  templates: FurnitureTemplate[];
  initialSelection?: { model: string; color: string } | null;
  onEditFurniture?: (template: FurnitureTemplate) => void;
}

const Visualizer: React.FC<VisualizerProps> = ({ fabrics, templates, initialSelection, onEditFurniture }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedFurniture, setSelectedFurniture] = useState<FurnitureTemplate | null>(null);
  const [selectedModelName, setSelectedModelName] = useState<string>('');
  const [selectedColorName, setSelectedColorName] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [showOriginalTexture, setShowOriginalTexture] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    checkApiKey();
    if (initialSelection) {
        setSelectedModelName(initialSelection.model);
        setSelectedColorName(initialSelection.color);
        setStep(1);
    }
  }, [initialSelection]);

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
    if (errorMessage && (errorMessage.includes("saturado") || errorMessage.includes("cuota"))) {
        setErrorMessage(null);
    }
  };

  const toSentenceCase = (str: string) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  const ensureBase64 = async (input: string): Promise<string> => {
    if (!input) return "";
    if (input.startsWith('data:')) {
      return input.split(',')[1];
    }
    
    try {
        const response = await fetch(input, { mode: 'cors' });
        if (response.ok) {
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }
    } catch (e) {}

    try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(input)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error("No se pudo descargar la imagen.");
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e: any) {
        throw new Error("Error procesando imagen para la IA.");
    }
  };

  const handleGenerate = async () => {
      setErrorMessage(null);
      setIsGenerating(true);
      setResultImage(null);
      setStep(3);

      try {
          const furnitureB64 = await ensureBase64(selectedFurniture!.imageUrl);
          const fabric = fabrics.find(f => f.name === selectedModelName);
          const swatchRaw = (selectedColorName && fabric?.colorImages?.[selectedColorName]) 
            ? fabric.colorImages[selectedColorName] 
            : fabric?.mainImage;
          
          if (!swatchRaw) throw new Error("No se encontró la muestra de tela.");
          const swatchB64 = await ensureBase64(swatchRaw);

          const result = await visualizeUpholstery(furnitureB64, swatchB64);
          if (result) setResultImage(result);

      } catch (error: any) {
          console.error("Error visualización Pro:", error);
          const errorText = error?.message || JSON.stringify(error);
          
          const isOverloaded = errorText.includes('503') || errorText.includes('overloaded') || errorText.includes('UNAVAILABLE');
          const isQuotaLimit = errorText.includes('429') || errorText.includes('exhausted') || errorText.includes('limit');

          if (isQuotaLimit) {
              setErrorMessage("Has alcanzado el límite de cuota gratuita de Google. Espera 30 segundos o activa tu propio motor privado para uso ilimitado.");
          } else if (isOverloaded) {
              setErrorMessage("El motor de IA está saturado por alta demanda global. Para prioridad inmediata, activa tu propio motor privado.");
          } else {
              setErrorMessage("No se pudo generar la vista previa. Intenta nuevamente o cambia de mueble/tela.");
          }
      } finally {
          setIsGenerating(false);
      }
  };

  const handleDownload = () => {
    if (resultImage) {
        const a = document.createElement('a');
        a.href = resultImage;
        a.download = `Creata_Visualizer_${selectedModelName}.png`;
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

  const activeFabric = fabrics.find(f => f.name === selectedModelName);
  const selectedSwatchUrl = (selectedColorName && activeFabric?.colorImages?.[selectedColorName]) 
    ? activeFabric.colorImages[selectedColorName] 
    : activeFabric?.mainImage;

  return (
    <div className="container mx-auto px-4 md:px-6 pb-20 max-w-7xl animate-fade-in-up">
      {/* Lightbox para textura original */}
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
        <h2 className="font-serif text-4xl md:text-5xl font-bold text-slate-900">Visualizador Pro</h2>
        <div className="flex items-center justify-center gap-2 mt-3 mb-8">
            <span className={`w-2 h-2 rounded-full ${hasKey ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">
                {hasKey ? 'Motor Privado Activo (Uso Ilimitado)' : 'Motor Compartido (Sujeto a límites de cuota)'}
            </p>
        </div>
        
        {/* REEMPLAZO DE PASOS 1-2-3 POR PREVIEW DE TELA (SOLO EN PASO 2) */}
        {step === 2 && selectedModelName && selectedSwatchUrl && (
             <div className="flex flex-col items-center justify-center mb-8 animate-fade-in">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Tela Seleccionada</p>
                <div 
                  className="w-24 h-24 rounded-full border-4 border-white shadow-xl cursor-pointer hover:scale-110 transition-transform overflow-hidden relative group"
                  onClick={() => { setPreviewImage(selectedSwatchUrl); setShowOriginalTexture(true); }}
                  title="Clic para ver foto original"
                >
                   <img src={selectedSwatchUrl} className="w-full h-full object-cover" alt="Selected" />
                   <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg>
                   </div>
                </div>
                <p className="mt-2 font-serif text-lg font-bold text-slate-800">{activeFabric?.name} <span className="text-gray-400">|</span> {toSentenceCase(selectedColorName || 'Modelo Base')}</p>
             </div>
        )}
      </div>

      <div className="bg-[oklch(0.67_0.00_68)] text-white rounded-[2rem] shadow-2xl overflow-hidden min-h-[600px] border border-gray-100/10 flex flex-col md:flex-row transition-colors duration-500">
          
          {step < 3 && (
            <div className="w-full p-8 md:p-12">
                 {step === 1 && (
                    <div className="animate-fade-in">
                        <h3 className="font-serif text-3xl mb-8 text-center text-white">1. Selecciona el mueble a retapizar</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            {templates.map((item) => (
                                <div key={item.id} onClick={() => { setSelectedFurniture(item); setStep(2); }} className="cursor-pointer rounded-3xl border border-white/20 hover:border-white bg-white/10 hover:bg-white/20 overflow-hidden group shadow-lg transition-all relative backdrop-blur-sm">
                                    <img 
                                      src={item.imageUrl} 
                                      className="w-full h-48 object-contain p-4 group-hover:scale-105 transition-transform duration-700" 
                                      alt={item.name}
                                    />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/40 backdrop-blur-md p-3 text-center border-t border-white/10">
                                        <h4 className="font-serif font-bold text-sm text-white line-clamp-1">{item.name}</h4>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                 )}

                 {step === 2 && (
                    <div className="flex flex-col md:flex-row gap-12 h-full animate-fade-in">
                        {/* Left Side: Furniture */}
                        <div className="w-full md:w-1/3 flex flex-col items-center">
                            <div className="aspect-square w-full bg-white rounded-3xl overflow-hidden border border-gray-100 mb-6 p-6 relative shadow-inner">
                                <img src={selectedFurniture?.imageUrl} className="w-full h-full object-contain drop-shadow-lg" />
                            </div>
                            
                            {/* BOTÓN "CAMBIAR MUEBLE" MÁS GRANDE */}
                            <button 
                                onClick={() => setStep(1)} 
                                className="w-full py-4 px-6 bg-white/20 hover:bg-white/30 rounded-full text-sm font-bold uppercase tracking-widest text-white transition-all flex items-center justify-center gap-3 backdrop-blur-md shadow-lg hover:shadow-xl"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                Cambiar Mueble
                            </button>
                        </div>

                        {/* Right Side: Fabric Selection */}
                        <div className="flex-1 flex flex-col space-y-8">
                            <div>
                                <h3 className="font-serif text-4xl mb-2 text-white">2. Elige la textura</h3>
                                <p className="text-sm text-white/70 font-medium">Selecciona una tela para ver cómo quedaría.</p>
                            </div>
                            
                            {/* Model Selector */}
                            <div className="relative">
                                <select 
                                    value={selectedModelName} 
                                    onChange={(e) => { setSelectedModelName(e.target.value); setSelectedColorName(''); }} 
                                    className="w-full p-4 pl-6 bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 focus:ring-2 focus:ring-white font-serif text-xl text-white outline-none appearance-none cursor-pointer hover:bg-white/20 transition-colors"
                                >
                                    <option value="" className="text-black">Selecciona el Modelo...</option>
                                    {fabrics.filter(f => f.category !== 'wood').sort((a,b)=>a.name.localeCompare(b.name)).map(f => (
                                        <option key={f.id} value={f.name} className="text-black">{f.name}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-white">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </div>
                            </div>

                            {selectedModelName ? (
                                <div className="space-y-4 animate-fade-in flex-1">
                                    <div className="flex justify-between items-end border-b border-white/20 pb-2">
                                        <p className="text-xs uppercase font-bold text-white/80 tracking-[0.2em]">Variantes Disponibles</p>
                                        {selectedColorName && (
                                            <p className="text-sm font-serif font-bold text-white animate-fade-in">{toSentenceCase(selectedColorName)}</p>
                                        )}
                                    </div>
                                    
                                    {/* Variants Grid - AUMENTADA 30% Y SIN SCROLLBAR */}
                                    <div className="flex flex-wrap gap-6 py-4 justify-start">
                                        {activeFabric?.colors.map((color, idx) => {
                                            const imgUrl = activeFabric.colorImages?.[color] || activeFabric.mainImage;
                                            const isSelected = selectedColorName === color;
                                            
                                            return (
                                                <div key={idx} className="flex flex-col items-center gap-2 group mb-4">
                                                    <div 
                                                        onClick={() => setSelectedColorName(color)} 
                                                        className={`relative w-28 h-28 md:w-32 md:h-32 rounded-[2rem] cursor-pointer transition-all duration-300 shadow-lg overflow-hidden ${isSelected ? 'ring-4 ring-offset-2 ring-offset-transparent ring-white scale-105 z-10' : 'hover:scale-105 hover:ring-2 hover:ring-white/50'}`}
                                                    >
                                                        <img src={imgUrl} className="w-full h-full object-cover" alt={color} />
                                                        
                                                        {/* Gradient Overlay for Name visibility */}
                                                        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/60 to-transparent"></div>
                                                        
                                                        {/* Hover / Select Actions */}
                                                        <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${isSelected ? 'bg-black/20' : 'bg-black/0 group-hover:bg-black/20'}`}>
                                                            {/* View Original Icon */}
                                                            <button 
                                                                onClick={(e) => handleViewOriginal(imgUrl, e)}
                                                                className={`p-2 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white hover:text-black transition-all transform ${isSelected ? 'scale-100 opacity-100' : 'scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100'}`}
                                                                title="Ver textura original"
                                                            >
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <span className={`text-xs font-bold uppercase tracking-wider text-white transition-opacity ${isSelected ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}>
                                                        {toSentenceCase(color)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-40 flex items-center justify-center bg-white/5 rounded-2xl border border-dashed border-white/20 text-white/50 text-sm italic">
                                    Selecciona un modelo arriba para ver sus colores
                                </div>
                            )}

                            {/* BOTÓN VER RESULTADO PRO - COLOR AZUL ESPECÍFICO */}
                            <button 
                                disabled={!selectedColorName} 
                                onClick={handleGenerate} 
                                className="w-full bg-[oklch(0.58_0.07_251)] text-white py-6 rounded-2xl font-bold uppercase tracking-[0.2em] text-sm shadow-xl disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] hover:shadow-2xl hover:brightness-110 transition-all mt-auto"
                            >
                                Ver Resultado Pro
                            </button>
                        </div>
                    </div>
                 )}
            </div>
          )}

          {step === 3 && (
            <>
                {/* Result Area */}
                <div className="w-full md:w-[65%] bg-[#F0F0F0] relative flex items-center justify-center overflow-hidden min-h-[500px]">
                     {isGenerating ? (
                        <div className="text-center z-10 p-6 animate-fade-in">
                            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-black mx-auto mb-6"></div>
                            <h3 className="font-serif text-2xl animate-pulse text-slate-800">Tapizando digitalmente...</h3>
                            <p className="text-[10px] text-gray-500 mt-3 uppercase tracking-widest font-bold">Respetando sombras y luces originales</p>
                        </div>
                     ) : errorMessage ? (
                        <div className="text-center p-10 max-w-md animate-fade-in bg-white/50 backdrop-blur-md rounded-3xl border border-white shadow-xl">
                            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500 border border-red-100">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            </div>
                            <h3 className="font-serif text-xl font-bold text-slate-900 mb-4">¡Motor Ocupado!</h3>
                            <p className="text-sm text-gray-600 mb-8 leading-relaxed">
                                {errorMessage}
                            </p>
                            
                            <div className="flex flex-col gap-3">
                                {!hasKey && (
                                    <button 
                                        onClick={handleOpenKeyDialog}
                                        className="bg-blue-600 text-white px-8 py-4 rounded-full text-xs font-bold uppercase tracking-widest hover:scale-105 transition-transform shadow-lg shadow-blue-200"
                                    >
                                        Activar Motor Privado (Solución Final)
                                    </button>
                                )}
                                
                                <button 
                                    onClick={handleGenerate} 
                                    className="bg-black text-white px-8 py-4 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-colors"
                                >
                                    Intentar nuevamente
                                </button>
                                
                                <button onClick={() => setStep(2)} className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-black transition-colors pt-2">Volver a Selección</button>
                            </div>
                        </div>
                     ) : resultImage ? (
                        <img src={resultImage} alt="Render Final" className="w-full h-full object-contain md:object-cover animate-fade-in" />
                     ) : null}
                </div>

                {/* Info Panel - Using the same grey bg to match theme consistency */}
                <div className="w-full md:w-[35%] bg-[oklch(0.80_0.00_68)] flex flex-col items-center text-center p-8 md:p-10 z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.1)] transition-colors duration-500 text-white">
                    <div className="w-full border-b border-white/20 pb-6 mb-8">
                        <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-white/80">Resultado Generado</h3>
                    </div>

                    <div className="flex-1 w-full flex flex-col items-center justify-center space-y-12">
                        <div>
                            <p className="text-[10px] font-bold uppercase text-white/60 tracking-[0.2em] mb-2">Mueble</p>
                            <h2 className="font-serif text-3xl text-white leading-none">
                                {toSentenceCase(selectedFurniture?.name || 'Mueble')}
                            </h2>
                        </div>

                        <div className="w-full relative">
                             <div className="w-12 h-px bg-white/20 mx-auto mb-8"></div>
                             
                             {/* FOTO DEL COLOR DE LA TELA (MINIATURA INTERACTIVA) */}
                             <div className="mb-6 relative group inline-block">
                                <p className="text-[10px] font-bold uppercase text-white/60 tracking-[0.2em] mb-4">Tapizado con</p>
                                <div 
                                    onClick={() => { setPreviewImage(selectedSwatchUrl || null); setShowOriginalTexture(true); }}
                                    className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-white/30 shadow-xl cursor-pointer hover:scale-110 transition-transform duration-300 mx-auto group"
                                >
                                    <img src={selectedSwatchUrl || ''} className="w-full h-full object-cover" alt="Swatch" />
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg>
                                    </div>
                                </div>
                             </div>

                             <h2 className="font-serif text-4xl text-white leading-tight mb-2">
                                {toSentenceCase(selectedModelName)}
                             </h2>
                             <p className="text-sm font-serif italic text-white/80">{toSentenceCase(selectedColorName)}</p>
                        </div>
                    </div>

                    <div className="w-full space-y-3 mt-8 pt-8 border-t border-white/20">
                        <button 
                            onClick={handleDownload}
                            disabled={!resultImage}
                            className="w-full bg-white text-black py-4 rounded-full font-bold uppercase tracking-[0.15em] text-[10px] shadow-lg hover:bg-gray-100 hover:scale-105 transition-all disabled:opacity-50"
                        >
                            Descargar Imagen
                        </button>
                        <button 
                            onClick={() => setStep(2)}
                            className="w-full bg-transparent text-white border border-white/30 py-4 rounded-full font-bold uppercase tracking-[0.15em] text-[10px] hover:bg-white/10 transition-colors"
                        >
                            Cambiar Textura
                        </button>
                    </div>
                </div>
            </>
          )}
      </div>
    </div>
  );
};

export default Visualizer;
