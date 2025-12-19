
import React, { useState, useEffect } from 'react';
import { generateFabricDesign } from '../services/geminiService';

interface ImageGenModalProps {
  onClose: () => void;
}

const ImageGenModal: React.FC<ImageGenModalProps> = ({ onClose }) => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [size, setSize] = useState('1K');
  const [loading, setLoading] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    if (window.aistudio) {
        window.aistudio.hasSelectedApiKey().then(setHasApiKey);
    }
  }, []);

  const handleGenerate = async () => {
    if (!prompt) return;

    if (!hasApiKey && window.aistudio) {
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
    }

    setLoading(true);
    setResultImage(null);
    try {
      const img = await generateFabricDesign(prompt, aspectRatio, size);
      setResultImage(img);
    } catch (e: any) {
      if (e.message === "API_KEY_RESET") {
          setHasApiKey(false);
          alert("Por favor, selecciona tu API Key de nuevo.");
      } else {
          alert("Error generando diseño de tela.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl h-[90vh] rounded-premium overflow-hidden flex flex-col md:flex-row shadow-2xl">
        
        {/* Left: Controls */}
        <div className="w-full md:w-1/3 p-8 border-r border-gray-100 overflow-y-auto bg-gray-50">
          <button onClick={onClose} className="mb-6 text-gray-400 hover:text-black font-medium flex items-center text-xs uppercase tracking-widest font-bold">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg> Cerrar
          </button>
          <h2 className="font-serif text-3xl mb-6 font-bold">Diseño Textil Pro</h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-2 tracking-widest">Concepto Creativo</label>
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ej: Terciopelo con bordado floral en hilo de oro sobre fondo verde bosque..."
                className="w-full h-32 p-4 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-black resize-none text-sm"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-2 tracking-widest">Formato</label>
                <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full p-3 rounded-lg border border-gray-200 text-xs font-bold">
                  <option value="1:1">1:1 (Cuadrado)</option>
                  <option value="3:4">3:4 (Retrato)</option>
                  <option value="4:3">4:3 (Paisaje)</option>
                  <option value="16:9">16:9 (Panorámico)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-2 tracking-widest">Calidad</label>
                <select value={size} onChange={(e) => setSize(e.target.value)} className="w-full p-3 rounded-lg border border-gray-200 text-xs font-bold">
                  <option value="1K">1K HD</option>
                  <option value="2K">2K UHD</option>
                  <option value="4K">4K RAW</option>
                </select>
              </div>
            </div>

            <button 
              onClick={handleGenerate}
              disabled={loading || !prompt}
              className="w-full bg-black text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-xl hover:opacity-80 disabled:opacity-50 transition-all"
            >
              {loading ? 'Generando Hilos...' : 'Crear Diseño con Gemini 3'}
            </button>
            
            {!hasApiKey && (
                 <p className="text-[9px] text-gray-400 text-center italic mt-4">
                    Se te pedirá seleccionar una API Key con facturación activa.
                 </p>
            )}
          </div>
        </div>

        {/* Right: Preview */}
        <div className="flex-1 bg-[#121212] flex items-center justify-center p-8 relative">
           {loading ? (
             <div className="text-white text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                <p className="font-serif animate-pulse text-lg">Tejiendo hilos digitales...</p>
             </div>
           ) : resultImage ? (
             <img src={resultImage} alt="Generated" className="max-w-full max-h-full rounded-lg shadow-2xl animate-fade-in" />
           ) : (
             <div className="text-gray-600 text-center">
               <svg className="w-16 h-16 mx-auto mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
               <p className="font-serif italic text-lg">Escribe un concepto para comenzar</p>
             </div>
           )}
           
           {resultImage && (
             <div className="absolute bottom-8 text-white bg-black/40 backdrop-blur-md px-4 py-2 rounded-full text-[10px] uppercase font-bold tracking-widest border border-white/10">
                Renderizado por Gemini 3 Pro
             </div>
           )}
        </div>

      </div>
    </div>
  );
};

export default ImageGenModal;
