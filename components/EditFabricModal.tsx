import React, { useState, useRef } from 'react';
import { Fabric } from '../types';

interface EditFabricModalProps {
  fabric: Fabric;
  onClose: () => void;
  onSave: (updatedFabric: Fabric) => void;
}

const EditFabricModal: React.FC<EditFabricModalProps> = ({ fabric, onClose, onSave }) => {
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

  const triggerImageUpload = (index: number) => {
    setEditingColorIndex(index);
    fileInputRef.current?.click();
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && editingColorIndex !== null) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const colorName = formData.colors[editingColorIndex];
        setFormData(prev => ({
          ...prev,
          colorImages: { ...prev.colorImages, [colorName]: base64 },
          // If it's the first color, update main image too optionally, or logic to keep mainImage separate
          mainImage: editingColorIndex === 0 ? base64 : prev.mainImage
        }));
        setEditingColorIndex(null);
      };
      reader.readAsDataURL(file);
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
            <h3 className="font-serif text-lg mb-4">Gestión de Variantes</h3>
            <div className="space-y-3">
              {formData.colors.map((color, idx) => (
                <div key={idx} className="flex items-center space-x-3 bg-gray-50 p-2 rounded-xl border border-gray-100">
                  {/* Image Preview & Upload */}
                  <div 
                    onClick={() => triggerImageUpload(idx)}
                    className="w-12 h-12 rounded-lg bg-gray-200 overflow-hidden cursor-pointer relative group flex-shrink-0"
                  >
                    <img 
                      src={formData.colorImages?.[color] || formData.mainImage} 
                      className="w-full h-full object-cover" 
                      alt="" 
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                       <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    </div>
                  </div>

                  {/* Name Input */}
                  <input 
                    type="text" 
                    value={color}
                    onChange={(e) => handleColorNameChange(idx, e.target.value)}
                    className="flex-1 bg-transparent border-none focus:ring-0 font-medium text-sm"
                  />

                  {/* Actions */}
                  <button onClick={() => handleRemoveColor(idx)} className="text-red-400 hover:text-red-600 p-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              ))}
            </div>
            
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFileChange} />
          </div>

        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end">
            <button 
              onClick={() => onSave(formData)}
              className="bg-black text-white px-8 py-3 rounded-full font-bold uppercase tracking-wide hover:bg-gray-800 transition-all shadow-lg"
            >
              Guardar Cambios
            </button>
        </div>
      </div>
    </div>
  );
};

export default EditFabricModal;