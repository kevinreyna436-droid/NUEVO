
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

  useEffect(() => {
    if (initialSelection) {
        setSelectedModelName(initialSelection.model);
        setSelectedColorName(initialSelection.color);
        setStep(1);
    }
  }, [initialSelection]);

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
        if (!response.ok) throw new Error("No se pudo descargar la imagen del servidor.");
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e: any) {
        console.error("Error en conversion Base64:", e);
        throw new Error("Error procesando imagen para la IA. Verifica tu conexión.");
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

          const result = await visualizeUpholstery(
              furnitureB64, 
              swatchB64,
              fabric ? { 
                  composition: fabric.specs.composition, 
                  weight: fabric.specs.weight,
                  technicalSummary: fabric.technicalSummary
              } : undefined
          );
          
          if (result) {
              setResultImage(result);
          }
      } catch (error: any) {
          console.error("Error visualización Pro:", error);
          
          const errorText = error?.message || JSON.stringify(error);
          const isOverloaded = errorText.includes('503') || errorText.includes('overloaded') || errorText.includes('capacity') || errorText.includes('UNAVAILABLE');

          if (isOverloaded) {
              setErrorMessage("El motor de IA está saturado por alta demanda. Por favor, intenta de nuevo en unos segundos.");
          } else if (errorText === "API_KEY_RESET") {
              setErrorMessage("Error de configuración. Contacte soporte.");
          } else {
              setErrorMessage("No se pudo generar la vista previa. Verifica tu conexión e intenta nuevamente.");
          }
      } finally {
          setIsGenerating(false);
      }
  };

  const handleDownload = () => {
    if (resultImage) {
        const a = document.createElement('a');
        a.href = resultImage;
        a.download = `Creata_Visualizer_${selectedModelName}_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
  };

  const activeFabric = fabrics.find(f => f.name === selectedModelName);

  return (
    <div className="container mx-auto px-4 md:px-6 pb-20 max-w-7xl animate-fade-in-up">
      <div className="text-center mb-8">
        <h2 className="font-serif text-4xl md:text-5xl font-bold text-slate-900">Visualizador Pro</h2>
        <div className="flex items-center justify-center gap-2 mt-3">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">
                Motor Nano Banana Pro Activo
            </p>
        </div>
      </div>

      <div className="flex justify-center items-center mb-10">
          {[1, 2, 3].map((s) => (
              <React.Fragment key={s}>
                  <div className={`flex items-center ${step >= s ? 'text-black' : 'text-gray-300'}`}>
                      <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center mr-2 transition-all duration-300 ${step >= s ? 'border-black bg-black text-white' : 'border-gray-300'}`}>{s}</div>
                  </div>
                  {s < 3 && <div className={`w-12 h-px mx-4 transition-colors duration-300 ${step > s ? 'bg-black' : 'bg-gray-200'}`}></div>}
              </React.Fragment>
          ))}
      </div>

      <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden min-h-[600px] border border-gray-100 flex flex-col md:flex-row">
          
          {step < 3 && (
            <div className="w-full p-8 md:p-12">
                 {step === 1 && (
                    <>
                        <h3 className="font-serif text-2xl mb-8 text-center text-slate-800">1. Selecciona el mueble a retapizar</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            {templates.map((item) => (
                                <div key={item.id} onClick={() => { setSelectedFurniture(item); setStep(2); }} className="cursor-pointer rounded-3xl border border-gray-100 hover:border-black overflow-hidden group shadow-sm hover:shadow-xl transition-all relative bg-white">
                                    {onEditFurniture && (
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEditFurniture(item);
                                            }}
                                            className="absolute top-2 right-2 z-10 w-8 h-8 bg-white/90 rounded-full shadow-md flex items-center justify-center text-gray-400 hover:text-black hover:scale-110 transition-all opacity-0 group-hover:opacity-100"
                                            title="Editar mueble"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                        </button>
                                    )}
                                    <img 
                                      src={item.imageUrl} 
                                      className="w-full h-48 object-contain p-4 group-hover:scale-105 transition-transform duration-700" 
                                      alt={item.name}
                                    />
                                    <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm p-3 text-center border-t border-gray-50">
                                        <h4 className="font-serif font-bold text-sm text-slate-900 line-clamp-1">{item.name}</h4>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                 )}

                 {step === 2 && (
                    <div className="flex flex-col md:flex-row gap-12 h-full">
                        <div className="w-full md:w-1/3 flex flex-col items-center">
                            <div className="aspect-square w-full bg-white rounded-3xl overflow-hidden border border-gray-100 mb-6 p-6 relative shadow-inner">
                                <img src={selectedFurniture?.imageUrl} className="w-full h-full object-contain drop-shadow-lg" />
                            </div>
                            <button onClick={() => setStep(1)} className="text-[10px] uppercase font-bold text-gray-400 hover:text-black border-b border-transparent hover:border-black transition-all pb-0.5">
                                ← Cambiar Mueble
                            </button>
                        </div>
                        <div className="flex-1 flex flex-col justify-center space-y-8">
                            <div>
                                <h3 className="font-serif text-3xl mb-2">2. Elige la textura</h3>
                                <p className="text-sm text-gray-400">Selecciona una tela del catálogo para aplicar.</p>
                            </div>
                            
                            <select value={selectedModelName} onChange={(e) => { setSelectedModelName(e.target.value); setSelectedColorName(''); }} className="w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-black font-serif text-lg text-slate-900 outline-none">
                                <option value="">Selecciona el Modelo...</option>
                                {fabrics.filter(f => f.category !== 'wood').sort((a,b)=>a.name.localeCompare(b.name)).map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                            </select>

                            {selectedModelName ? (
                                <div className="space-y-4 animate-fade-in">
                                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Variantes Disponibles</p>
                                    <div className="flex flex-wrap gap-4 max-h-60 overflow-y-auto pr-2">
                                        {activeFabric?.colors.map((color, idx) => (
                                            <div 
                                                key={idx} 
                                                onClick={() => setSelectedColorName(color)} 
                                                className={`group relative w-16 h-16 rounded-full cursor-pointer transition-all duration-300 ${selectedColorName === color ? 'ring-2 ring-offset-2 ring-black scale-110' : 'hover:scale-105'}`}
                                                title={color}
                                            >
                                                <img src={activeFabric.colorImages?.[color] || activeFabric.mainImage} className="w-full h-full rounded-full object-cover shadow-md border border-gray-100" />
                                                {selectedColorName === color && (
                                                    <div className="absolute inset-0 bg-black/10 rounded-full flex items-center justify-center">
                                                        <div className="w-2 h-2 bg-white rounded-full shadow-sm"></div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    {selectedColorName && <p className="text-sm font-medium text-slate-900">Color seleccionado: <span className="font-serif italic">{selectedColorName}</span></p>}
                                </div>
                            ) : (
                                <div className="h-40 flex items-center justify-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-400 text-sm">
                                    Selecciona un modelo arriba para ver colores
                                </div>
                            )}

                            <button disabled={!selectedColorName} onClick={handleGenerate} className="w-full bg-black text-white py-5 rounded-xl font-bold uppercase tracking-[0.2em] text-xs shadow-xl disabled:opacity-50 hover:scale-[1.02] transition-transform mt-auto">
                                Generar Visualización
                            </button>
                        </div>
                    </div>
                 )}
            </div>
          )}

          {step === 3 && (
            <>
                <div className="w-full md:w-[65%] bg-[#F0F0F0] relative flex items-center justify-center overflow-hidden min-h-[500px]">
                     {isGenerating ? (
                        <div className="text-center z-10 p-6">
                            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-black mx-auto mb-6"></div>
                            <h3 className="font-serif text-2xl animate-pulse text-slate-800">Tapizando digitalmente...</h3>
                            <p className="text-[10px] text-gray-500 mt-3 uppercase tracking-widest font-bold">Analizando luces y sombras</p>
                        </div>
                     ) : errorMessage ? (
                        <div className="text-center p-10 max-w-md animate-fade-in">
                            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 text-red-400 border border-red-100">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            </div>
                            <h3 className="font-bold text-slate-800 mb-3 text-lg">Hubo un problema</h3>
                            <p className="text-sm text-gray-500 mb-8 leading-relaxed">{errorMessage}</p>
                            <button onClick={() => setStep(2)} className="text-xs font-bold uppercase tracking-widest border-b-2 border-black pb-1 hover:text-black/70 transition-colors">Intentar de nuevo</button>
                        </div>
                     ) : resultImage ? (
                        <img src={resultImage} alt="Render Final" className="w-full h-full object-contain md:object-cover animate-fade-in" />
                     ) : null}
                     
                     <div className="absolute bottom-6 left-6 opacity-30 pointer-events-none">
                         <span className="font-serif text-xl font-bold tracking-tighter">CREATA</span>
                     </div>
                </div>

                <div className="w-full md:w-[35%] bg-white border-l border-gray-100 flex flex-col items-center text-center p-8 md:p-10 z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.02)]">
                    
                    <div className="w-full border-b border-gray-100 pb-6 mb-8">
                        <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-gray-900">Ficha de Composición</h3>
                    </div>

                    <div className="flex-1 w-full flex flex-col items-center justify-center space-y-12">
                        <div className="w-full">
                            <p className="text-[10px] font-bold uppercase text-gray-500 tracking-[0.2em] mb-3">Modelo de Mueble</p>
                            <h2 className="font-serif text-4xl text-slate-900 leading-none mb-1">
                                {toSentenceCase(selectedFurniture?.name || 'Personalizado')}
                            </h2>
                            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-widest mt-2">
                                {selectedFurniture?.category || 'Cliente'}
                            </p>
                        </div>

                        <div className="w-full relative">
                             <div className="w-16 h-px bg-gray-300 mx-auto mb-8"></div>
                             
                             <p className="text-[10px] font-bold uppercase text-gray-500 tracking-[0.2em] mb-3">Tela Seleccionada</p>
                             <h2 className="font-serif text-4xl text-slate-900 leading-tight mb-4">
                                {toSentenceCase(selectedModelName)}
                             </h2>
                             
                             <div className="inline-block px-6 py-2 rounded-full bg-black text-white mt-1 shadow-md">
                                <p className="text-xs font-bold uppercase tracking-[0.2em]">
                                    {toSentenceCase(selectedColorName)}
                                </p>
                             </div>
                        </div>

                        <div className="w-full">
                            <p className="text-[10px] font-bold uppercase text-gray-500 tracking-[0.2em] mb-2">Proveedor Textil</p>
                            <p className="text-sm font-bold text-slate-900 uppercase tracking-widest">
                                {activeFabric?.supplier || 'CREATA STOCK'}
                            </p>
                        </div>
                    </div>

                    <div className="w-full space-y-3 mt-8 pt-8 border-t border-gray-100">
                        <button 
                            onClick={handleDownload}
                            disabled={!resultImage}
                            className="w-full bg-black text-white py-4 rounded-full font-bold uppercase tracking-[0.15em] text-[10px] shadow-lg hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
                        >
                            Descargar Imagen
                        </button>
                        
                        <button 
                            onClick={() => setStep(2)}
                            className="w-full bg-white text-gray-900 border border-gray-200 py-4 rounded-full font-bold uppercase tracking-[0.15em] text-[10px] hover:bg-gray-50 transition-colors"
                        >
                            Volver a Editar
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
