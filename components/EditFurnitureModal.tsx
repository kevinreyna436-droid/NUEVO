
import React, { useState, useRef } from 'react';
import { FurnitureTemplate } from '../types';
import { compressImage } from '../utils/imageCompression';

interface EditFurnitureModalProps {
  furniture: FurnitureTemplate;
  onClose: () => void;
  onSave: (updated: FurnitureTemplate) => void;
  onDelete: (id: string) => void;
}

const EditFurnitureModal: React.FC<EditFurnitureModalProps> = ({ furniture, onClose, onSave, onDelete }) => {
  const [formData, setFormData] = useState<FurnitureTemplate>({ ...furniture });
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setIsProcessing(true);
          try {
              const base64 = await compressImage(e.target.files[0], 2048, 0.9);
              setFormData(prev => ({ ...prev, imageUrl: base64 }));
          } catch (err) {
              alert("Error procesando imagen");
          } finally {
              setIsProcessing(false);
          }
      }
  };

  const handleDelete = () => {
      if (window.confirm("¿Seguro que deseas eliminar este mueble del catálogo?")) {
          onDelete(furniture.id);
          onClose();
      }
  };

  const handleSaveInternal = () => {
      onSave(formData);
      onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col p-8">
        <div className="flex justify-between items-center mb-6">
            <h3 className="font-serif text-2xl font-bold">Editar Mueble</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-black">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        <div className="space-y-6 overflow-y-auto max-h-[70vh] pr-2">
            {/* Image Preview */}
            <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full aspect-square bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 cursor-pointer overflow-hidden relative group"
            >
                {formData.imageUrl ? (
                    <img src={formData.imageUrl} className="w-full h-full object-contain p-4" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">Sin Imagen</div>
                )}
                
                <div className="absolute inset-0 bg-black/30 hidden group-hover:flex items-center justify-center">
                    <span className="text-white font-bold uppercase text-xs border border-white px-3 py-1 rounded-full">Cambiar Foto</span>
                </div>
                
                {isProcessing && (
                    <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                         <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
                    </div>
                )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />

            {/* Fields */}
            <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Nombre Modelo</label>
                <input 
                    type="text" 
                    value={formData.name} 
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 focus:outline-none focus:ring-1 focus:ring-black"
                    placeholder="Ej: Sofá Chesterfield"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Proveedor</label>
                    <input 
                        type="text" 
                        value={formData.supplier || ''} 
                        onChange={(e) => setFormData({...formData, supplier: e.target.value.toUpperCase()})}
                        className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 focus:outline-none focus:ring-1 focus:ring-black uppercase"
                        placeholder="PROVEEDOR"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Categoría</label>
                    <input 
                        type="text" 
                        value={formData.category} 
                        onChange={(e) => setFormData({...formData, category: e.target.value})}
                        className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 focus:outline-none focus:ring-1 focus:ring-black"
                        placeholder="Ej: Sofá, Butaca, Cama..."
                    />
                </div>
            </div>

            <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Catálogo / Colección</label>
                <input 
                    type="text" 
                    value={formData.catalog || ''} 
                    onChange={(e) => setFormData({...formData, catalog: e.target.value})}
                    className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 focus:outline-none focus:ring-1 focus:ring-black"
                    placeholder="Ej: Colección 2024"
                />
            </div>

            <div className="flex gap-4 pt-4">
                <button 
                    onClick={handleDelete}
                    className="flex-1 py-3 text-red-500 font-bold uppercase text-xs border border-red-200 rounded-xl hover:bg-red-50"
                >
                    Eliminar
                </button>
                <button 
                    onClick={handleSaveInternal}
                    className="flex-[2] py-3 bg-black text-white font-bold uppercase text-xs rounded-xl hover:scale-105 transition-transform shadow-lg"
                >
                    Guardar Cambios
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default EditFurnitureModal;
