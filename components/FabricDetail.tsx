import React, { useState, useEffect } from 'react';
import { Fabric } from '../types';
import EditFabricModal from './EditFabricModal';

interface FabricDetailProps {
  fabric: Fabric;
  onBack: () => void;
  onEdit: (updatedFabric: Fabric) => void;
  onDelete: (id: string) => void;
}

const FabricDetail: React.FC<FabricDetailProps> = ({ fabric, onBack, onEdit, onDelete }) => {
  const [showSpecs, setShowSpecs] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isEditModalOpen, setEditModalOpen] = useState(false);

  // Sort colors alphabetically for display, handle undefined colors safely
  const sortedColors = [...(fabric.colors || [])].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

  // Keydown listener for arrow keys in lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex !== null) {
        if (e.key === 'ArrowRight') handleNextImage(e);
        if (e.key === 'ArrowLeft') handlePrevImage(e);
        if (e.key === 'Escape') setLightboxIndex(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex]);

  const handleNextImage = (e?: React.MouseEvent | KeyboardEvent) => {
    e?.stopPropagation();
    if (lightboxIndex !== null && sortedColors.length > 0) {
      setLightboxIndex((prev) => (prev! + 1) % sortedColors.length);
    }
  };

  const handlePrevImage = (e?: React.MouseEvent | KeyboardEvent) => {
    e?.stopPropagation();
    if (lightboxIndex !== null && sortedColors.length > 0) {
      setLightboxIndex((prev) => (prev! - 1 + sortedColors.length) % sortedColors.length);
    }
  };

  const getLightboxImage = () => {
    if (lightboxIndex === null) return null;
    const colorName = sortedColors[lightboxIndex];
    return fabric.colorImages?.[colorName] || fabric.mainImage;
  };

  return (
    <div className="min-h-screen bg-[#f2f2f2] pb-20 animate-fade-in-up relative">
      
      {/* Edit Modal */}
      {isEditModalOpen && (
        <EditFabricModal 
          fabric={fabric} 
          onClose={() => setEditModalOpen(false)} 
          onSave={(updated) => {
            onEdit(updated);
            setEditModalOpen(false);
          }}
          onDelete={() => {
              // Trigger the delete logic passed from App
              onDelete(fabric.id);
          }}
        />
      )}

      {/* Lightbox Overlay (Full Screen Image with Navigation) */}
      {lightboxIndex !== null && (
        <div 
            className="fixed inset-0 z-[100] bg-white/30 backdrop-blur-xl flex items-center justify-center cursor-pointer p-4 md:p-8"
            onClick={() => setLightboxIndex(null)}
        >
            {/* Prev Button */}
            <button 
              onClick={handlePrevImage}
              className="absolute left-4 md:left-8 text-black hover:scale-125 transition-transform p-4 z-[110]"
            >
               <svg className="w-10 h-10 md:w-16 md:h-16 drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" /></svg>
            </button>

            {/* Image */}
            <div className="relative max-w-5xl max-h-full">
               <img 
                  src={getLightboxImage()!} 
                  alt="Full Texture" 
                  className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-sm animate-fade-in border-[1px] border-white/20"
               />
               <p className="text-center mt-4 font-serif text-2xl font-bold text-black drop-shadow-md">
                 {sortedColors[lightboxIndex]}
               </p>
            </div>

            {/* Next Button */}
            <button 
              onClick={handleNextImage}
              className="absolute right-4 md:right-8 text-black hover:scale-125 transition-transform p-4 z-[110]"
            >
               <svg className="w-10 h-10 md:w-16 md:h-16 drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" /></svg>
            </button>

            {/* Close X (optional, clicking bg closes too) */}
            <button className="absolute top-6 right-6 text-black opacity-50 hover:opacity-100">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
      )}

      {/* Navigation Header */}
      <div className="sticky top-0 z-40 bg-[#f2f2f2]/90 backdrop-blur-sm px-6 py-3 flex items-center justify-center border-b border-gray-200/50">
        <div className="absolute left-6">
            <button onClick={onBack} className="flex items-center text-gray-400 hover:text-black transition-colors text-xs font-medium uppercase tracking-wide">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Volver
            </button>
        </div>
        
        {/* Right side controls */}
        <div className="absolute right-6 flex items-center space-x-4">
            <button 
                onClick={() => setEditModalOpen(true)} 
                className="text-gray-400 hover:text-black transition-colors font-bold text-3xl pb-4 h-8 flex items-center"
                title="Modificar ficha completa"
            >
                .
            </button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex flex-col items-center text-center max-w-5xl">
        
        {/* 1. Centered Header Info */}
        <div className="mb-6 space-y-2">
            <h2 className="text-gray-400 italic font-serif text-sm tracking-wide">CREATA</h2>
            <h1 className="font-serif text-6xl md:text-7xl font-bold text-slate-900 tracking-tight leading-none">
                {fabric.name}
            </h1>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.25em] pt-2">
                {fabric.supplier}
            </p>
        </div>

        {/* Collapsible Technical Specs */}
        <div className="w-full max-w-3xl mb-16">
            {!showSpecs ? (
                <button 
                    onClick={() => setShowSpecs(true)}
                    className="group flex items-center justify-center mx-auto space-x-2 text-xs font-medium text-gray-500 hover:text-black transition-colors px-6 py-2 rounded-full border border-gray-300 hover:border-black hover:bg-white"
                >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    <span>Ficha técnica</span>
                </button>
            ) : (
                <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 animate-fade-in text-left relative mt-4">
                    <button 
                        onClick={() => setShowSpecs(false)}
                        className="absolute top-6 right-6 text-gray-300 hover:text-black"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    
                    <div className="pr-8">
                        <h3 className="font-serif text-xl mb-4 text-slate-800">Resumen Técnico</h3>
                        <p className="text-base text-gray-500 leading-relaxed mb-6">{fabric.technicalSummary || "Información técnica no disponible."}</p>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 border-t border-gray-100 pt-6">
                            <div>
                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Composición</span>
                                <span className="text-sm text-slate-800 font-medium">{fabric.specs.composition || "N/A"}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Durabilidad</span>
                                <span className="text-sm text-slate-800 font-medium">{fabric.specs.martindale || "N/A"}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Uso</span>
                                <span className="text-sm text-slate-800 font-medium">{fabric.specs.usage || "N/A"}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Peso</span>
                                <span className="text-sm text-slate-800 font-medium">{fabric.specs.weight || "N/A"}</span>
                            </div>
                        </div>

                        <div className="mt-8 flex justify-end">
                             <a 
                               href={fabric.pdfUrl || "#"} 
                               download={`${fabric.name}-ficha-tecnica.pdf`}
                               className="flex items-center space-x-2 bg-black text-white px-6 py-3 rounded-full text-xs font-bold uppercase hover:bg-gray-800 transition-colors shadow-lg"
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

        {/* 2. Muestrario Interactivo (Circular Grid) */}
        <div className="w-full">
            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.25em] mb-12">Variantes de Color</h3>
            
            {/* Increased gap to gap-8 (more separation) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 gap-y-10 justify-items-center">
              {sortedColors.map((color, idx) => {
                const colorImg = fabric.colorImages?.[color] || fabric.mainImage;
                
                return (
                  <div key={idx} className="flex flex-col items-center group w-full">
                    <div 
                      onClick={() => setLightboxIndex(idx)} 
                      className="relative w-64 h-64 rounded-full border-[1px] border-gray-300 overflow-hidden cursor-pointer bg-white shadow-md transition-all duration-500 hover:shadow-2xl hover:scale-105"
                    >
                       <img 
                         src={colorImg} 
                         alt={color} 
                         className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                       />
                       
                       {/* HOVER OVERLAY WITH ICON */}
                       <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[1px]">
                          <svg className="w-12 h-12 text-white drop-shadow-lg transform scale-75 group-hover:scale-100 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                       </div>
                    </div>
                    
                    <p className="mt-6 text-base font-bold text-slate-900 uppercase tracking-widest text-center group-hover:text-black transition-colors">
                      {color}
                    </p>
                  </div>
                );
              })}
            </div>
            
            {/* If empty grid */}
            {sortedColors.length === 0 && (
                <p className="text-sm text-gray-400 italic py-10">No hay variantes cargadas.</p>
            )}
        </div>

      </div>
    </div>
  );
};

export default FabricDetail;