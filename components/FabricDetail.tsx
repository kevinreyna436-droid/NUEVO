import React, { useState } from 'react';
import { Fabric } from '../types';

interface FabricDetailProps {
  fabric: Fabric;
  onBack: () => void;
  onUpdate: (updatedFabric: Fabric) => void;
}

const FabricDetail: React.FC<FabricDetailProps> = ({ fabric, onBack }) => {
  const [showSpecs, setShowSpecs] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Helper function to clean displayed color name
  const getCleanColorName = (fullColorName: string) => {
    let name = fullColorName;
    // 1. Remove "Fromatex" prefix (case insensitive)
    name = name.replace(/^Fromatex[_\-\s]*/i, '');
    
    // 2. Remove Fabric Name prefix if present (case insensitive)
    if (fabric.name) {
        // Escape special regex characters in fabric name just in case
        const escapedFabricName = fabric.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
        const modelRegex = new RegExp(`^${escapedFabricName}[_\\-\\s]*`, 'i');
        name = name.replace(modelRegex, '');
    }
    
    return name.trim();
  };

  return (
    <div 
        className="min-h-screen pb-20 animate-fade-in-up relative"
        style={{ backgroundColor: 'rgb(219, 219, 219)' }}
    >
      
      {/* Lightbox Overlay (Full Screen Image) - 70% Opacity + Blur */}
      {lightboxImage && (
        <div 
            className="fixed inset-0 z-[100] bg-white/70 backdrop-blur-lg flex items-center justify-center cursor-pointer p-8 transition-all"
            onClick={() => setLightboxImage(null)}
        >
            <img 
                src={lightboxImage} 
                alt="Full Texture" 
                className="max-w-full max-h-full object-contain shadow-2xl rounded-[2rem] animate-fade-in border-4 border-black"
            />
        </div>
      )}

      {/* Navigation Header */}
      <div className="sticky top-0 z-40 bg-[rgb(219,219,219)]/90 backdrop-blur-sm px-6 py-3 flex items-center justify-center border-b border-gray-300/50">
        <div className="absolute left-6">
            <button onClick={onBack} className="flex items-center text-gray-500 hover:text-black transition-colors text-xs font-medium uppercase tracking-wide">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Volver
            </button>
        </div>
        
        {/* Decorative Dot (No Action) */}
        <div className="absolute right-6 text-gray-400 font-bold text-2xl pb-4 select-none">.</div>
      </div>

      <div className="container mx-auto px-4 py-6 flex flex-col items-center text-center max-w-5xl">
        
        {/* 1. Centered Header Info */}
        <div className="mb-6 space-y-2">
            <h2 className="text-gray-500 italic font-serif text-sm tracking-wide">CREATA</h2>
            {/* Reduced Title Size */}
            <h1 className="font-serif text-4xl md:text-5xl font-bold text-slate-900 tracking-tight leading-none">
                {fabric.name}
            </h1>
        </div>

        {/* Collapsible Technical Specs */}
        <div className="w-full max-w-3xl mb-12">
            {!showSpecs ? (
                <button 
                    onClick={() => setShowSpecs(true)}
                    className="group flex items-center justify-center mx-auto space-x-2 text-xs font-medium text-gray-500 hover:text-black transition-colors px-5 py-2 rounded-full border border-gray-300 hover:border-black/30 hover:bg-white/50"
                >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    <span>Ficha técnica</span>
                </button>
            ) : (
                <div className="bg-white rounded-2xl p-6 shadow-xl border border-gray-100 animate-fade-in text-left relative mt-4">
                    <button 
                        onClick={() => setShowSpecs(false)}
                        className="absolute top-4 right-4 text-gray-300 hover:text-black"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    
                    <div className="pr-8">
                        <h3 className="font-serif text-lg mb-3 text-slate-800">Resumen Técnico</h3>
                        <p className="text-sm text-gray-500 leading-relaxed mb-4">{fabric.technicalSummary || "Información técnica no disponible."}</p>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-gray-100 pt-4">
                            <div>
                                <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Composición</span>
                                <span className="text-xs text-slate-800 font-medium">{fabric.specs.composition || "N/A"}</span>
                            </div>
                            <div>
                                <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Durabilidad</span>
                                <span className="text-xs text-slate-800 font-medium">{fabric.specs.martindale || "N/A"}</span>
                            </div>
                            <div>
                                <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Uso</span>
                                <span className="text-xs text-slate-800 font-medium">{fabric.specs.usage || "N/A"}</span>
                            </div>
                            <div>
                                <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Peso</span>
                                <span className="text-xs text-slate-800 font-medium">{fabric.specs.weight || "N/A"}</span>
                            </div>
                        </div>

                        {/* Download Button */}
                        <div className="mt-6 flex justify-end">
                             <a 
                               href={fabric.pdfUrl || "#"} 
                               download={`${fabric.name}-ficha-tecnica.pdf`}
                               className="flex items-center space-x-2 bg-black text-white px-4 py-2 rounded-full text-xs font-bold uppercase hover:bg-gray-800 transition-colors"
                               onClick={(e) => { if(!fabric.pdfUrl) { e.preventDefault(); alert("PDF simulado descargado."); } }}
                             >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                <span>Descargar Ficha</span>
                             </a>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* 2. Muestrario Interactivo (Updated to Large Circles & Centered Flex) */}
        <div className="w-full mt-8">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-12">Variantes de Color</h3>
            
            {/* Flex container for centering and wrapping */}
            <div className="flex flex-wrap justify-center gap-10">
              {fabric.colors.map((color, idx) => {
                const colorImg = fabric.colorImages?.[color] || fabric.mainImage;
                
                return (
                  <div 
                    key={idx} 
                    className="flex flex-col items-center group cursor-pointer" 
                    onClick={() => setLightboxImage(colorImg)}
                  >
                    {/* Circle Image - Increased size, thin black border, almost no padding */}
                    <div className="w-40 h-40 md:w-48 md:h-48 rounded-full border-[0.5px] border-black p-[2px] shadow-sm transition-transform duration-500 group-hover:scale-105 group-hover:shadow-2xl bg-white overflow-hidden">
                        <img 
                            src={colorImg} 
                            alt={color} 
                            className="w-full h-full rounded-full object-cover scale-[1.01]" 
                        />
                    </div>
                    {/* Color Name - Cleaned */}
                    <span className="mt-5 text-xs font-bold text-gray-600 uppercase tracking-widest group-hover:text-black transition-colors">
                        {getCleanColorName(color)}
                    </span>
                  </div>
                );
              })}
            </div>
            
            {/* If empty grid */}
            {fabric.colors.length === 0 && (
                <p className="text-xs text-gray-400 italic">No hay variantes cargadas.</p>
            )}
        </div>

      </div>
    </div>
  );
};

export default FabricDetail;