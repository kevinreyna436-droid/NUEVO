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
          // REDUCED TO 200px / 0.5 to fit Firestore limit (Aggressive)
          const base64 = await compressImage(file, 200, 0.5);
          const colorName = formData.colors[editingColorIndex];
          setFormData(prev => ({
            ...prev,
            colorImages: { ...prev.colorImages, [colorName]: base64 },
            // If it's the first color, update main image too optionally, or logic to keep mainImage separate
            mainImage: editingColorIndex === 0 ? base64 : prev.mainImage
          }));
      } catch (err: any) {
          console.error("Error compressing image", err?.message || "Unknown error");
          alert("Error al procesar la imagen.");
      }
      setEditingColorIndex(null);
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
          <h2 className="font-serif text-2xl font-bold text-primary">Editar Ficha</h2>
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

          <div>
             <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Resumen Técnico</label>
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

          <hr className="border-gray-100" />

          {/* Colors Management */}
          <div>
              <div className="flex justify-between items-center mb-4">
                  <label className="block text-xs font-bold uppercase text-gray-400">Variantes de Color</label>
                  <button onClick={handleAddColor} className="text-xs font-bold text-blue-500 hover:underline">+ Añadir Color</button>
              </div>
              
              <div className="space-y-3">
                  {formData.colors.map((color, idx) => (
                      <div key={idx} className="flex items-center space-x-3 bg-gray-50 p-2 rounded-lg">
                          {/* Image Preview / Upload */}
                          <div 
                              onClick={() => triggerImageUpload(idx)}
                              className="w-10 h-10 bg-gray-200 rounded cursor-pointer overflow-hidden flex-shrink-0 hover:opacity-80"
                          >
                              {formData.colorImages && formData.colorImages[color] ? (
                                  <img src={formData.colorImages[color]} alt={color} className="w-full h-full object-cover" />
                              ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-[8px]">Upload</div>
                              )}
                          </div>

                          {/* Name Input */}
                          <input 
                              type="text" 
                              value={color} 
                              onChange={(e) => handleColorNameChange(idx, e.target.value)}
                              className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium"
                          />

                          {/* Delete */}
                          <button onClick={() => handleRemoveColor(idx)} className="text-red-400 hover:text-red-600 p-2">
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