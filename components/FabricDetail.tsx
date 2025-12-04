import React, { useState, useEffect } from 'react';
import { Fabric } from '../types';

interface FabricDetailProps {
  fabric: Fabric;
  onBack: () => void;
  onUpdate: (updatedFabric: Fabric) => void;
}

const FabricDetail: React.FC<FabricDetailProps> = ({ fabric, onBack, onUpdate }) => {
  const [showSpecs, setShowSpecs] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  
  // Edit Mode State
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Fabric>(fabric);

  // Sync state if prop updates
  useEffect(() => {
    setEditData(fabric);
  }, [fabric]);

  // Helper function to clean displayed color name (View Mode)
  const getCleanName = (text: string, isFabricName: boolean = false) => {
    let name = text;
    // Remove "Fromatex", "Fotmatex", "Formatex" prefix (case insensitive)
    name = name.replace(/^(fromatex|fotmatex|formatex)[_\-\s]*/i, '');
    
    if (!isFabricName && fabric.name) {
        // Also clean the current fabric name to find the core name to strip from color
        const coreFabricName = fabric.name.replace(/^(fromatex|fotmatex|formatex)[_\-\s]*/i, '').trim();
        const escapedFabricName = coreFabricName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
        const modelRegex = new RegExp(`^${escapedFabricName}[_\\-\\s]*`, 'i');
        name = name.replace(modelRegex, '');
    }
    return name.trim();
  };

  // --- Handlers for Edit Mode ---
  const handleSave = () => {
    onUpdate(editData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData(fabric); // Reset to original
    setIsEditing(false);
  };

  const handleSpecChange = (key: keyof typeof fabric.specs, value: string) => {
    setEditData(prev => ({
      ...prev,
      specs: { ...prev.specs, [key]: value }
    }));
  };

  const handleDeleteColor = (colorToDelete: string) => {
    if (window.confirm(`¿Eliminar la variante ${colorToDelete}?`)) {
        const newColors = editData.colors.filter(c => c !== colorToDelete);
        const newImages = { ...editData.colorImages };
        delete newImages[colorToDelete];
        
        setEditData(prev => ({
            ...prev,
            colors: newColors,
            colorImages: newImages
        }));
    }
  };

  return (
    <div 
        className="min-h-screen pb-20 animate-fade-in-up relative"
        style={{ backgroundColor: 'rgb(219, 219, 219)' }}
    >
      
      {/* Lightbox Overlay */}
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
        
        {/* EDIT BUTTON (Formerly the decorative dot) */}
        <div className="absolute right-6 flex items-center">
            {isEditing ? (
                 <div className="flex space-x-2">
                    <button onClick={handleCancel} className="text-xs font-bold text-red-500 uppercase">Cancelar</button>
                    <button onClick={handleSave} className="bg-black text-white px-3 py-1 rounded-full text-xs font-bold uppercase">Guardar</button>
                 </div>
            ) : (
                <button 
                    onClick={() => setIsEditing(true)} 
                    className="text-gray-400 hover:text-black font-bold text-2xl pb-4 transition-colors focus:outline-none"
                    title="Editar Tela"
                >
                    .
                </button>
            )}
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex flex-col items-center text-center max-w-5xl">
        
        {/* --- VIEW MODE --- */}
        {!isEditing ? (
            <>
                {/* 1. Header Info */}
                <div className="mb-6 space-y-2">
                    <h2 className="text-gray-500 italic font-serif text-sm tracking-wide">CREATA</h2>
                    {/* Size: 4xl/5xl - Smaller than Grid Title (6xl/7xl) */}
                    <h1 className="font-serif text-4xl md:text-5xl font-bold text-slate-900 tracking-tight leading-none">
                        {getCleanName(fabric.name, true)}
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
                                 <div className="mt-4 pt-2 text-right">
                                    <span className="text-[9px] font-bold text-gray-300 uppercase">Proveedor: {fabric.supplier}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. Colors Grid */}
                <div className="w-full mt-8">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-12">Variantes de Color</h3>
                    
                    <div className="flex flex-wrap justify-center gap-10">
                    {fabric.colors.map((color, idx) => {
                        const colorImg = fabric.colorImages?.[color] || fabric.mainImage;
                        return (
                        <div 
                            key={idx} 
                            className="flex flex-col items-center group cursor-pointer" 
                            onClick={() => setLightboxImage(colorImg)}
                        >
                            <div className="w-40 h-40 md:w-48 md:h-48 rounded-full border-[0.5px] border-black p-[2px] shadow-sm transition-transform duration-500 group-hover:scale-105 group-hover:shadow-2xl bg-white overflow-hidden">
                                <img src={colorImg} alt={color} className="w-full h-full rounded-full object-cover scale-[1.01]" />
                            </div>
                            <span className="mt-5 text-xs font-bold text-gray-600 uppercase tracking-widest group-hover:text-black transition-colors">
                                {getCleanName(color)}
                            </span>
                        </div>
                        );
                    })}
                    </div>
                </div>
            </>
        ) : (
            /* --- EDIT MODE --- */
            <div className="w-full max-w-4xl animate-fade-in bg-white/50 backdrop-blur-sm p-8 rounded-[3rem] border border-white shadow-sm">
                
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Modo Edición</h3>

                <div className="space-y-6 text-left">
                    {/* Name & Supplier */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Nombre de la Tela</label>
                            <input 
                                type="text" 
                                value={editData.name} 
                                onChange={(e) => setEditData({...editData, name: e.target.value})}
                                className="w-full bg-transparent border-b border-gray-400 text-3xl font-serif font-bold text-black focus:outline-none focus:border-black py-2"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Proveedor</label>
                            <input 
                                type="text" 
                                value={editData.supplier} 
                                onChange={(e) => setEditData({...editData, supplier: e.target.value})}
                                className="w-full bg-transparent border-b border-gray-300 text-xl text-gray-700 focus:outline-none focus:border-black py-2"
                            />
                        </div>
                    </div>

                    {/* Summary */}
                    <div>
                         <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Resumen Técnico</label>
                         <textarea 
                            value={editData.technicalSummary}
                            onChange={(e) => setEditData({...editData, technicalSummary: e.target.value})}
                            className="w-full bg-white border border-gray-200 rounded-xl p-4 text-sm focus:outline-none focus:ring-1 focus:ring-black h-24 resize-none"
                         />
                    </div>

                    {/* Specs Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white p-4 rounded-2xl border border-gray-100">
                         <div>
                            <label className="block text-[9px] font-bold uppercase text-gray-400">Composición</label>
                            <input type="text" value={editData.specs.composition} onChange={(e) => handleSpecChange('composition', e.target.value)} className="w-full border-b border-gray-200 text-sm py-1 focus:outline-none focus:border-black"/>
                         </div>
                         <div>
                            <label className="block text-[9px] font-bold uppercase text-gray-400">Durabilidad</label>
                            <input type="text" value={editData.specs.martindale} onChange={(e) => handleSpecChange('martindale', e.target.value)} className="w-full border-b border-gray-200 text-sm py-1 focus:outline-none focus:border-black"/>
                         </div>
                         <div>
                            <label className="block text-[9px] font-bold uppercase text-gray-400">Uso</label>
                            <input type="text" value={editData.specs.usage} onChange={(e) => handleSpecChange('usage', e.target.value)} className="w-full border-b border-gray-200 text-sm py-1 focus:outline-none focus:border-black"/>
                         </div>
                         <div>
                            <label className="block text-[9px] font-bold uppercase text-gray-400">Peso</label>
                            <input type="text" value={editData.specs.weight || ''} onChange={(e) => handleSpecChange('weight', e.target.value)} className="w-full border-b border-gray-200 text-sm py-1 focus:outline-none focus:border-black"/>
                         </div>
                    </div>

                    {/* Editable Colors */}
                    <div className="pt-6">
                        <label className="block text-[10px] font-bold uppercase text-gray-400 mb-4 text-center">Editar Fotos / Variantes (Click en X para borrar)</label>
                        <div className="flex flex-wrap justify-center gap-6">
                            {editData.colors.map((color, idx) => (
                                <div key={idx} className="relative group">
                                    <div className="w-24 h-24 rounded-full border border-gray-200 p-1 bg-white opacity-80">
                                        <img src={editData.colorImages?.[color] || editData.mainImage} alt="" className="w-full h-full rounded-full object-cover grayscale group-hover:grayscale-0 transition-all"/>
                                    </div>
                                    <input 
                                        type="text" 
                                        value={color} 
                                        onChange={(e) => {
                                            const newColors = [...editData.colors];
                                            newColors[idx] = e.target.value;
                                            // Note: Renaming key in colorImages object is complex here, simplest to just edit display name array for now
                                            setEditData({...editData, colors: newColors});
                                        }}
                                        className="mt-2 w-24 text-center text-xs border-b border-gray-300 bg-transparent focus:outline-none focus:border-black"
                                    />
                                    {/* DELETE BUTTON */}
                                    <button 
                                        onClick={() => handleDeleteColor(color)}
                                        className="absolute -top-1 -right-1 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-md hover:bg-red-700 transition-colors z-10"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default FabricDetail;