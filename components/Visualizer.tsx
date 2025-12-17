
import React, { useState, useRef } from 'react';
import { Fabric, FurnitureTemplate } from '../types';
import { visualizeUpholstery } from '../services/geminiService';
import { compressImage } from '../utils/imageCompression';

interface VisualizerProps {
  fabrics: Fabric[];
  templates: FurnitureTemplate[];
}

const Visualizer: React.FC<VisualizerProps> = ({ fabrics, templates }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedFurniture, setSelectedFurniture] = useState<FurnitureTemplate | null>(null);
  
  // Fabric Selection State
  const [selectedModelName, setSelectedModelName] = useState<string>('');
  const [selectedColorName, setSelectedColorName] = useState<string>('');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  
  // Ref for temporary file upload
  const tempInputRef = useRef<HTMLInputElement>(null);

  // Helper to get image base64 from URL (since furniture templates are URLs)
  const getBase64FromUrl = async (url: string): Promise<string> => {
    // 1. Si ya es base64, devolver limpio
    if (url.startsWith('data:')) {
        return url.split(',')[1];
    }

    // Función interna para intentar cargar imagen
    const loadImage = async (src: string, useCors: boolean): Promise<string> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            if (useCors) img.crossOrigin = 'Anonymous';
            img.src = src;
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    try {
                        ctx.drawImage(img, 0, 0);
                        const dataURL = canvas.toDataURL('image/jpeg', 0.9);
                        resolve(dataURL.split(',')[1]);
                    } catch (err) {
                        reject(new Error("Bloqueo de seguridad (CORS) al procesar la imagen."));
                    }
                } else {
                    reject(new Error("Error interno de gráficos (Canvas)."));
                }
            };
            img.onerror = () => reject(new Error("No se pudo cargar la imagen original."));
        });
    };

    try {
        // METHODO 1: Fetch Directo (Lo más limpio si el servidor lo permite)
        try {
            const response = await fetch(url, { mode: 'cors' });
            if (response.ok) {
                const blob = await response.blob();
                const file = new File([blob], "temp.jpg", { type: "image/jpeg" });
                const base64 = await compressImage(file, 1500, 0.9);
                return base64.split(',')[1];
            }
        } catch (e) {
            console.warn("Fetch directo falló, intentando método Canvas...", e);
        }

        // METODO 2: Canvas Directo con CORS
        try {
            return await loadImage(url, true);
        } catch (e) {
            console.warn("Canvas directo falló, intentando con Proxy...", e);
        }

        // METODO 3: Proxy Fallback (Para imágenes de Unsplash/Web bloqueadas)
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        try {
            return await loadImage(proxyUrl, true);
        } catch (e) {
            console.error("Fallo final con proxy", e);
            throw new Error("No se pudo descargar la imagen. Por favor, usa la opción 'Subir Foto Temporal' con una imagen de tu dispositivo.");
        }

    } catch (finalError: any) {
        throw finalError;
    }
  };

  // Helper to get fabric base64
  const getFabricBase64 = async (): Promise<string | null> => {
      const fabric = fabrics.find(f => f.name === selectedModelName);
      if (!fabric) return null;
      
      let imgData = '';
      if (selectedColorName && fabric.colorImages?.[selectedColorName]) {
          imgData = fabric.colorImages[selectedColorName];
      } else {
          imgData = fabric.mainImage;
      }

      if (!imgData) return null;
      
      // Check if it's a URL (cloud storage)
      if (imgData.startsWith('http')) {
          try {
             return await getBase64FromUrl(imgData);
          } catch(e) {
             console.error("Error getting fabric image", e);
             return null;
          }
      }
      
      // If it's base64 data uri
      return imgData.includes(',') ? imgData.split(',')[1] : imgData;
  };

  const handleGenerate = async () => {
      if (!selectedFurniture || !selectedModelName) return;
      
      setIsGenerating(true);
      setResultImage(null);
      setStep(3);

      try {
          const furnitureBase64 = await getBase64FromUrl(selectedFurniture.imageUrl);
          const fabricBase64 = await getFabricBase64();

          if (!furnitureBase64 || !fabricBase64) {
              alert("Error cargando imágenes base. Intenta subir tus propias fotos en lugar de usar las predeterminadas.");
              setIsGenerating(false);
              setStep(2);
              return;
          }

          const result = await visualizeUpholstery(furnitureBase64, fabricBase64);
          if (result) {
              setResultImage(result);
          } else {
              alert("La IA no pudo generar la imagen. Intenta con otra combinación.");
              setStep(2);
          }
      } catch (error: any) {
          console.error(error);
          alert(error.message || "Error de conexión con el servicio de IA.");
          setStep(2);
      } finally {
          setIsGenerating(false);
      }
  };

  const handleTempFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          try {
              const file = e.target.files[0];
              // Compress locally
              const base64 = await compressImage(file, 2000, 0.9);
              
              // Create a temporary template object that only exists in memory
              const tempTemplate: FurnitureTemplate = {
                  id: `temp-${Date.now()}`,
                  name: 'Mueble Temporal',
                  category: 'Personal',
                  supplier: 'Mi Dispositivo',
                  imageUrl: base64 // This is a data URI, not a cloud URL
              };
              
              setSelectedFurniture(tempTemplate);
              setStep(2);
          } catch (err) {
              alert("Error al cargar la imagen local.");
          }
          // Reset input
          if (tempInputRef.current) tempInputRef.current.value = '';
      }
  };

  // Get available colors for selected model
  const activeFabric = fabrics.find(f => f.name === selectedModelName);
  const availableColors = activeFabric?.colors || [];

  return (
    <div className="container mx-auto px-6 pb-20 max-w-5xl animate-fade-in-up">
      <div className="text-center mb-10">
        <h2 className="font-serif text-4xl font-bold text-slate-900">Probador Virtual</h2>
        <p className="text-sm text-gray-500 uppercase tracking-widest mt-2">
            Visualiza telas sin guardar datos en la nube
        </p>
      </div>

      {/* STEP INDICATORS */}
      <div className="flex justify-center items-center mb-12">
          <div className={`flex items-center ${step >= 1 ? 'text-black font-bold' : 'text-gray-300'}`}>
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center mr-2 ${step >= 1 ? 'border-black bg-black text-white' : 'border-gray-300'}`}>1</div>
              <span className="text-xs uppercase tracking-wider">Mueble</span>
          </div>
          <div className="w-12 h-px bg-gray-200 mx-4"></div>
          <div className={`flex items-center ${step >= 2 ? 'text-black font-bold' : 'text-gray-300'}`}>
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center mr-2 ${step >= 2 ? 'border-black bg-black text-white' : 'border-gray-300'}`}>2</div>
              <span className="text-xs uppercase tracking-wider">Tela</span>
          </div>
          <div className="w-12 h-px bg-gray-200 mx-4"></div>
          <div className={`flex items-center ${step >= 3 ? 'text-black font-bold' : 'text-gray-300'}`}>
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center mr-2 ${step >= 3 ? 'border-black bg-black text-white' : 'border-gray-300'}`}>3</div>
              <span className="text-xs uppercase tracking-wider">Resultado</span>
          </div>
      </div>

      {/* CONTENT AREA */}
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden min-h-[500px] border border-gray-100 flex flex-col">
          
          {/* STEP 1: SELECT FURNITURE */}
          {step === 1 && (
              <div className="p-8 md:p-12 flex-1">
                  <h3 className="font-serif text-2xl mb-8 text-center">Selecciona un modelo base</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* TEMPORARY UPLOAD CARD */}
                        <div 
                            onClick={() => tempInputRef.current?.click()}
                            className="group cursor-pointer rounded-2xl border-2 border-dashed border-gray-300 hover:border-black hover:bg-gray-50 transition-all flex flex-col items-center justify-center min-h-[200px]"
                        >
                            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3 group-hover:bg-white group-hover:shadow-md transition-all">
                                <svg className="w-6 h-6 text-gray-500 group-hover:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4 4m0 0L8 8m4-4v12" /></svg>
                            </div>
                            <span className="font-bold text-sm text-gray-600 group-hover:text-black uppercase tracking-wide">Subir Foto Temporal</span>
                            <span className="text-[10px] text-gray-400 mt-1">No se guarda en la nube</span>
                            <input ref={tempInputRef} type="file" accept="image/*" className="hidden" onChange={handleTempFileUpload} />
                        </div>

                        {templates.map((item) => (
                            <div 
                                key={item.id}
                                onClick={() => { setSelectedFurniture(item); setStep(2); }}
                                className="group cursor-pointer rounded-2xl border border-gray-100 hover:border-black transition-all hover:shadow-lg overflow-hidden relative"
                            >
                                <div className="aspect-[4/3] bg-gray-50 overflow-hidden">
                                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                </div>
                                <div className="p-4 text-center">
                                    <h4 className="font-serif font-bold text-lg">{item.name}</h4>
                                    <div className="flex justify-center gap-2 text-[10px] text-gray-400 uppercase tracking-widest mt-1">
                                        <span>{item.category}</span>
                                        {item.supplier && <span>• {item.supplier}</span>}
                                    </div>
                                </div>
                            </div>
                        ))}
                  </div>
              </div>
          )}

          {/* STEP 2: SELECT FABRIC */}
          {step === 2 && (
              <div className="p-8 md:p-12 flex-1 flex flex-col md:flex-row gap-8">
                  {/* Left: Selected Furniture Preview */}
                  <div className="w-full md:w-1/3 flex flex-col items-center">
                      <div className="w-full aspect-square bg-gray-50 rounded-2xl overflow-hidden border border-gray-200 mb-4 p-4 relative">
                          {selectedFurniture && <img src={selectedFurniture.imageUrl} className="w-full h-full object-contain mix-blend-multiply" alt="Base" />}
                          {selectedFurniture?.id.startsWith('temp') && (
                              <div className="absolute top-2 right-2 bg-yellow-100 text-yellow-800 text-[9px] font-bold px-2 py-1 rounded uppercase">Temporal</div>
                          )}
                      </div>
                      <button onClick={() => setStep(1)} className="text-xs text-gray-400 underline hover:text-black">Cambiar Mueble</button>
                  </div>

                  {/* Right: Fabric Selectors */}
                  <div className="flex-1 space-y-8">
                      <div>
                          <label className="block text-xs font-bold uppercase text-gray-400 mb-2">1. Elige el Modelo</label>
                          <select 
                            value={selectedModelName}
                            onChange={(e) => { setSelectedModelName(e.target.value); setSelectedColorName(''); }}
                            className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-black font-serif text-lg"
                          >
                              <option value="">Seleccionar...</option>
                              {fabrics
                                .filter(f => f.category !== 'wood')
                                .sort((a,b) => a.name.localeCompare(b.name))
                                .map(f => (
                                  <option key={f.id} value={f.name}>{f.name} ({f.supplier})</option>
                              ))}
                          </select>
                      </div>

                      {selectedModelName && (
                          <div className="animate-fade-in">
                              <label className="block text-xs font-bold uppercase text-gray-400 mb-2">2. Elige el Color</label>
                              <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 max-h-60 overflow-y-auto p-2">
                                  {availableColors.map((color, idx) => {
                                      const img = activeFabric?.colorImages?.[color] || activeFabric?.mainImage;
                                      return (
                                          <div 
                                            key={idx}
                                            onClick={() => setSelectedColorName(color)}
                                            className={`aspect-square rounded-full cursor-pointer border-2 overflow-hidden transition-all ${selectedColorName === color ? 'border-black scale-110 ring-2 ring-black ring-offset-2' : 'border-gray-200 hover:scale-105'}`}
                                            title={color}
                                          >
                                              {img ? (
                                                  <img src={img} className="w-full h-full object-cover" alt={color} />
                                              ) : (
                                                  <div className="w-full h-full bg-gray-100 flex items-center justify-center text-[8px]">{color.slice(0,2)}</div>
                                              )}
                                          </div>
                                      )
                                  })}
                              </div>
                              {selectedColorName && (
                                  <p className="text-center mt-2 font-bold font-serif">{selectedColorName}</p>
                              )}
                          </div>
                      )}

                      <div className="pt-6">
                          <button 
                            disabled={!selectedModelName || (availableColors.length > 0 && !selectedColorName)}
                            onClick={handleGenerate}
                            className="w-full bg-black text-white py-4 rounded-xl font-bold uppercase tracking-widest hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:scale-100 shadow-xl"
                          >
                              Tapizar con IA
                          </button>
                      </div>
                  </div>
              </div>
          )}

          {/* STEP 3: RESULT */}
          {step === 3 && (
              <div className="flex-1 relative flex flex-col">
                  {isGenerating ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-20 space-y-6">
                          <div className="relative w-24 h-24">
                              <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
                              <div className="absolute inset-0 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
                          </div>
                          <div className="text-center">
                              <h3 className="font-serif text-2xl font-bold mb-2">Tejiendo virtualmente...</h3>
                              <p className="text-gray-400 text-sm max-w-md mx-auto">Adaptando la textura macro (5cm) a la escala del mueble (2m). Ajustando iluminación de estudio...</p>
                          </div>
                      </div>
                  ) : (
                      <div className="flex-1 bg-white flex flex-col md:flex-row h-full">
                          <div className="flex-1 bg-[#ffffff] flex items-center justify-center p-8 border-r border-gray-100 relative">
                               {resultImage && (
                                   <>
                                       <img src={resultImage} alt="Resultado" className="max-w-full max-h-[60vh] object-contain shadow-2xl rounded-lg" />
                                       <div className="absolute top-4 left-4 bg-green-100 text-green-800 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-green-200 shadow-sm flex items-center gap-1">
                                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                            Imagen Local (No guardada en Nube)
                                       </div>
                                   </>
                               )}
                          </div>
                          <div className="w-full md:w-80 bg-gray-50 p-8 flex flex-col justify-center space-y-6">
                              <div>
                                  <h4 className="font-serif text-xl font-bold">Resumen</h4>
                                  <p className="text-sm text-gray-500 mt-1">{selectedFurniture?.name}</p>
                                  <div className="flex flex-col gap-1 mt-1">
                                    <span className="text-xs text-gray-400 uppercase tracking-wider">{selectedFurniture?.supplier}</span>
                                    <span className="text-sm text-gray-500 font-bold">{selectedModelName} - {selectedColorName}</span>
                                  </div>
                              </div>
                              
                              <button 
                                onClick={() => setStep(1)} 
                                className="w-full bg-white border border-gray-300 text-black py-3 rounded-xl font-bold uppercase text-xs tracking-widest hover:bg-black hover:text-white transition-colors"
                              >
                                  Nueva Prueba
                              </button>
                              
                              {resultImage && (
                                  <a 
                                    href={resultImage} 
                                    download={`Creata_Prueba_${selectedModelName}.png`}
                                    className="w-full bg-black text-white py-3 rounded-xl font-bold uppercase text-xs tracking-widest hover:opacity-80 transition-opacity flex items-center justify-center gap-2"
                                  >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                      Descargar
                                  </a>
                              )}
                          </div>
                      </div>
                  )}
              </div>
          )}

      </div>
    </div>
  );
};

export default Visualizer;
