
import React, { useState } from 'react';
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

  // Helper to get image base64 from URL (since furniture templates are URLs)
  const getBase64FromUrl = async (url: string): Promise<string> => {
    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error(`Failed to load image: ${url}`);
        const blob = await response.blob();
        const file = new File([blob], "temp.jpg", { type: "image/jpeg" });
        const base64 = await compressImage(file, 1024, 0.9); // Moderate quality for input
        return base64.split(',')[1];
    } catch (e) {
        console.error("Error processing image URL:", e);
        // Fallback or re-throw
        throw new Error("No se pudo descargar la imagen del mueble. Verifica que sea una URL válida y pública.");
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
              alert("Error cargando imágenes base. Asegúrate de que las imágenes sean accesibles.");
              setIsGenerating(false);
              setStep(2);
              return;
          }

          const result = await visualizeUpholstery(furnitureBase64, fabricBase64);
          if (result) {
              setResultImage(result);
          } else {
              alert("No se pudo generar la imagen. Intenta de nuevo.");
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

  // Get available colors for selected model
  const activeFabric = fabrics.find(f => f.name === selectedModelName);
  const availableColors = activeFabric?.colors || [];

  return (
    <div className="container mx-auto px-6 pb-20 max-w-5xl animate-fade-in-up">
      <div className="text-center mb-10">
        <h2 className="font-serif text-4xl font-bold text-slate-900">Probador Virtual</h2>
        <p className="text-sm text-gray-500 uppercase tracking-widest mt-2">Visualiza tus telas en muebles reales</p>
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
                  
                  {templates.length === 0 ? (
                      <div className="text-center py-10 text-gray-400">
                          <p>No hay muebles cargados.</p>
                          <p className="text-xs">Usa el botón "." arriba a la derecha para gestionar muebles.</p>
                      </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                                    <p className="text-[10px] text-gray-400 uppercase tracking-widest">{item.category}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                  )}
              </div>
          )}

          {/* STEP 2: SELECT FABRIC */}
          {step === 2 && (
              <div className="p-8 md:p-12 flex-1 flex flex-col md:flex-row gap-8">
                  {/* Left: Selected Furniture Preview */}
                  <div className="w-full md:w-1/3 flex flex-col items-center">
                      <div className="w-full aspect-square bg-gray-50 rounded-2xl overflow-hidden border border-gray-200 mb-4 p-4">
                          {selectedFurniture && <img src={selectedFurniture.imageUrl} className="w-full h-full object-contain mix-blend-multiply" alt="Base" />}
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
                          <div className="flex-1 bg-[#ffffff] flex items-center justify-center p-8 border-r border-gray-100">
                               {resultImage && (
                                   <img src={resultImage} alt="Resultado" className="max-w-full max-h-[60vh] object-contain shadow-2xl rounded-lg" />
                               )}
                          </div>
                          <div className="w-full md:w-80 bg-gray-50 p-8 flex flex-col justify-center space-y-6">
                              <div>
                                  <h4 className="font-serif text-xl font-bold">Resumen</h4>
                                  <p className="text-sm text-gray-500 mt-1">{selectedFurniture?.name}</p>
                                  <p className="text-sm text-gray-500">{selectedModelName} - {selectedColorName}</p>
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
