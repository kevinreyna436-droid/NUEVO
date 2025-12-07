import React, { useState, useRef } from 'react';
import { Fabric } from '../types';
import { compressImage } from '../utils/imageCompression';

interface EditFabricModalProps {
  fabric: Fabric;
  onClose: () => void;
  onSave: (updatedFabric: Fabric) => void;
  onDelete: () => void;
}

const EditFabricModal: React.FC<EditFabricModalProps> = ({ fabric, onClose, onSave, onDelete }) => {
  // Ensure default values for arrays/objects to prevent crashes
  const [formData, setFormData] = useState<Fabric>({ 
      ...fabric,
      colors: fabric.colors || [],
      colorImages: fabric.colorImages || {}
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const specsImageInputRef = useRef<HTMLInputElement>(null);
  const specsPdfInputRef = useRef<HTMLInputElement>(null);
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);

  const handleChange = (field: keyof Fabric, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSpecChange = (field: keyof typeof fabric.specs, value: string) => {
    setFormData(prev => ({
      ...prev,
      specs: { ...prev.specs, [field]: value }
    }));
  };

  const handleColorNameChange = (index: number, newName: string) => {
    const newColors = [...formData.colors];
    const oldName = newColors[index];
    newColors[index] = newName;

    // Update image key if name changes
    const newColorImages = { ...formData.colorImages };
    if (newColorImages[oldName]) {
      newColorImages[newName] = newColorImages[oldName];
      delete newColorImages[oldName];
    }

    setFormData(prev => ({ ...prev, colors: newColors, colorImages: newColorImages }));
  };

  const handleRemoveColor = (index: number) => {
    const colorName = formData.colors[index];
    const newColors = formData.colors.filter((_, i) => i !== index);
    const newColorImages = { ...formData.colorImages };
    delete newColorImages[colorName];
    setFormData(prev => ({ ...prev, colors: newColors, colorImages: newColorImages }));
  };

  const handleAddColor = () => {
    setFormData(prev => ({
        ...prev,
        colors: [...prev.colors, "Nuevo Color"]
    }));
  };

  const triggerImageUpload = (index: number) => {
    setEditingColorIndex(index);
    fileInputRef.current?.click();
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && editingColorIndex !== null) {
      const file = e.target.files[0];
      try {
          // Reverted to 600px quality
          const base64 = await compressImage(file, 600, 0.80);
          const colorName = formData.colors[editingColorIndex];
          
          setFormData(prev => {
              // If it's the first color and main image is empty/default, use a higher res version for main
              let newMain = prev.mainImage;
              
              return {
                ...prev,
                colorImages: { ...prev.colorImages, [colorName]: base64 },
                mainImage: newMain
              };
          });
      } catch (err: any) {
          console.error("Error compressing image", err?.message || "Unknown error");
          alert("Error al procesar la imagen.");
      }
      setEditingColorIndex(null);
    }
  };
  
  const handleSpecsImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          try {
              const base64 = await compressImage(file, 1600, 0.90);
              setFormData(prev => ({ ...prev, specsImage: base64 }));
          } catch(err) {
              alert("Error subiendo imagen de ficha técnica.");
          }
      }
  };

  const handleSpecsPdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (file.type !== 'application/pdf') {
            alert('Solo se permiten archivos PDF.');
            return;
        }
        if (file.size > 1000000) { // 1MB Soft Limit check
             if(!window.confirm("El archivo PDF es mayor a 1MB. Podría haber problemas al guardar en la nube. ¿Desea continuar?")) {
                 return;
             }
        }
        
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            setFormData(prev => ({ ...prev, pdfUrl: reader.result as string }));
        };
        reader.onerror = () => alert("Error leyendo el PDF.");
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      
      // Confirmation moved here to ensure UI interaction is caught
      if (window.confirm("¿Estás seguro de que quieres eliminar esta ficha completamente? Esta acción no se puede deshacer.")) {
        onDelete();
      }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 className="font-serif text-2xl font-bold text-primary">Editar Ficha de Ingreso</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-black">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Nombre Tela</label>
              <input 
                type="text" 
                value={formData.name} 
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 focus:ring-1 focus:ring-black outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Proveedor</label>
              <input 
                type="text" 
                value={formData.supplier} 
                onChange={(e) => handleChange('supplier', e.target.value)}
                className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 focus:ring-1 focus:ring-black outline-none"
              />
            </div>
          </div>
          
          {/* Custom Catalog Field - Emphasized */}
          <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
            <label className="block text-xs font-bold uppercase text-blue-800 mb-2">Catálogo (Lo escribes tú)</label>
            <input 
                type="text" 
                value={formData.customCatalog || ''} 
                onChange={(e) => handleChange('customCatalog', e.target.value)}
                placeholder="Escribe aquí el nombre del catálogo..."
                className="w-full p-3 bg-white rounded-lg border border-blue-200 focus:ring-1 focus:ring-blue-500 outline-none font-medium text-blue-900"
            />
          </div>

          <div>
             <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Resumen Técnico (Texto)</label>
             <textarea 
               value={formData.technicalSummary}
               onChange={(e) => handleChange('technicalSummary', e.target.value)}
               className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 focus:ring-1 focus:ring-black outline-none h-24 resize-none"
             />
          </div>

          {/* Specs */}
          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Composición</label>
                <input type="text" value={formData.specs.composition} onChange={(e) => handleSpecChange('composition', e.target.value)} className="w-full p-2 bg-gray-50 rounded border border-gray-200 text-sm"/>
             </div>
             <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Durabilidad</label>
                <input type="text" value={formData.specs.martindale} onChange={(e) => handleSpecChange('martindale', e.target.value)} className="w-full p-2 bg-gray-50 rounded border border-gray-200 text-sm"/>
             </div>
             <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Uso</label>
                <input type="text" value={formData.specs.usage} onChange={(e) => handleSpecChange('usage', e.target.value)} className="w-full p-2 bg-gray-50 rounded border border-gray-200 text-sm"/>
             </div>
             <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Peso</label>
                <input type="text" value={formData.specs.weight || ''} onChange={(e) => handleSpecChange('weight', e.target.value)} className="w-full p-2 bg-gray-50 rounded border border-gray-200 text-sm"/>
             </div>
          </div>
          
          {/* Tech Sheet Uploads (Image & PDF) */}
          <div className="border-t border-gray-100 pt-4">
              <label className="block text-xs font-bold uppercase text-gray-400 mb-4">Archivos de Ficha Técnica</label>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Image Upload */}
                  <div className="flex flex-col space-y-2 p-3 border border-gray-100 rounded-xl bg-gray-50">
                      <span className="text-[10px] font-bold uppercase text-gray-400">Imagen (JPG/PNG)</span>
                      <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-white rounded border border-gray-200 overflow-hidden flex items-center justify-center">
                              {formData.specsImage ? (
                                  <img src={formData.specsImage} alt="Specs" className="w-full h-full object-cover" />
                              ) : (
                                  <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              )}
                          </div>
                          <div className="flex flex-col space-y-1">
                            <button 
                                onClick={() => specsImageInputRef.current?.click()}
                                className="text-xs font-bold text-blue-600 hover:underline text-left"
                            >
                                {formData.specsImage ? 'Cambiar Foto' : 'Subir Foto'}
                            </button>
                            {formData.specsImage && (
                                <button onClick={() => handleChange('specsImage', '')} className="text-[10px] text-red-400 hover:text-red-600 text-left">Quitar</button>
                            )}
                          </div>
                      </div>
                  </div>

                  {/* PDF Upload */}
                  <div className="flex flex-col space-y-2 p-3 border border-gray-100 rounded-xl bg-gray-50">
                      <span className="text-[10px] font-bold uppercase text-gray-400">Documento (PDF)</span>
                      <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-white rounded border border-gray-200 flex items-center justify-center">
                               {formData.pdfUrl ? (
                                   <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>
                               ) : (
                                   <span className="text-gray-300 text-[9px] font-bold">PDF</span>
                               )}
                          </div>
                          <div className="flex flex-col space-y-1">
                            <button 
                                onClick={() => specsPdfInputRef.current?.click()}
                                className="text-xs font-bold text-blue-600 hover:underline text-left"
                            >
                                {formData.pdfUrl ? 'Cambiar PDF' : 'Subir PDF'}
                            </button>
                            {formData.pdfUrl && (
                                <button onClick={() => handleChange('pdfUrl', '')} className="text-[10px] text-red-400 hover:text-red-600 text-left">Quitar</button>
                            )}
                          </div>
                      </div>
                  </div>
              </div>

              <input ref={specsImageInputRef} type="file" className="hidden" accept="image/*" onChange={handleSpecsImageChange} />
              <input ref={specsPdfInputRef} type="file" className="hidden" accept="application/pdf" onChange={handleSpecsPdfChange} />
          </div>

          <hr className="border-gray-100" />

          {/* Colors Management */}
          <div>
              <div className="flex justify-between items-center mb-4">
                  <label className="block text-xs font-bold uppercase text-gray-400">Fotos y Colores</label>
                  <button onClick={handleAddColor} className="text-xs font-bold text-blue-500 hover:underline">+ Añadir Color</button>
              </div>
              
              <div className="space-y-3">
                  {formData.colors.map((color, idx) => (
                      <div key={idx} className="flex items-center space-x-3 bg-gray-50 p-2 rounded-lg">
                          {/* Image Preview / Upload */}
                          <div 
                              onClick={() => triggerImageUpload(idx)}
                              className="w-10 h-10 bg-gray-200 rounded cursor-pointer overflow-hidden flex-shrink-0 hover:opacity-80 relative group"
                          >
                              {formData.colorImages && formData.colorImages[color] ? (
                                  <img src={formData.colorImages[color]} alt={color} className="w-full h-full object-cover" />
                              ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-[8px]">Foto</div>
                              )}
                              <div className="absolute inset-0 bg-black/20 hidden group-hover:flex items-center justify-center">
                                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              </div>
                          </div>

                          {/* Name Input */}
                          <input 
                              type="text" 
                              value={color} 
                              onChange={(e) => handleColorNameChange(idx, e.target.value)}
                              className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium"
                          />

                          {/* Delete */}
                          <button onClick={() => handleRemoveColor(idx)} className="text-red-400 hover:text-red-600 p-2" title="Quitar Color">
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                      </div>
                  ))}
              </div>
          </div>
        </div>
        
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex flex-col space-y-4">
            <button 
                type="button"
                onClick={() => onSave(formData)}
                className="w-full bg-black text-white py-3 rounded-xl font-bold tracking-wide hover:opacity-80 transition-all"
            >
                Guardar Cambios
            </button>
            
            <button 
                type="button"
                onClick={handleDeleteClick}
                className="w-full text-red-400 text-xs font-bold uppercase tracking-widest hover:text-red-600 hover:underline py-2"
            >
                Eliminar Ficha
            </button>
        </div>

        {/* Hidden File Input */}
        <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*"
            onChange={handleImageFileChange}
        />
      </div>
    </div>
  );
};

export default EditFabricModal;