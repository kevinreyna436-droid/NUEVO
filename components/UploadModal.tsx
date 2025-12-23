
import React, { useState, useRef } from 'react';
import { extractFabricData, extractColorFromSwatch } from '../services/geminiService';
import { Fabric, FurnitureTemplate } from '../types';
import { compressImage } from '../utils/imageCompression';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (fabric: Fabric) => Promise<void> | void;
  onBulkSave?: (fabrics: Fabric[]) => Promise<void> | void;
  onReset?: () => void;
  existingFabrics?: Fabric[];
  existingFurniture?: FurnitureTemplate[];
  onSaveFurniture?: (template: FurnitureTemplate) => Promise<void> | void;
  onDeleteFurniture?: (id: string) => Promise<void> | void;
}

const UploadModal: React.FC<UploadModalProps> = ({ 
    isOpen, onClose, onSave, onBulkSave, onReset, existingFabrics = [],
    existingFurniture = [], onSaveFurniture, onDeleteFurniture
}) => {
  const [activeTab, setActiveTab] = useState<'fabrics' | 'furniture' | 'matcher'>('fabrics');
  const [step, setStep] = useState<'upload' | 'processing' | 'review'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [extractedFabrics, setExtractedFabrics] = useState<Partial<Fabric>[]>([]);
  const [currentProgress, setCurrentProgress] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Matcher state
  const [matchFiles, setMatchFiles] = useState<File[]>([]);
  const matcherInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const toSentenceCase = (str: string) => str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';

  const handleMatchImages = async () => {
      if (matchFiles.length === 0) return;
      setIsSaving(true);
      setCurrentProgress('Emparejando imágenes...');

      let matchCount = 0;
      for (const file of matchFiles) {
          const fileName = file.name.split('.')[0].toLowerCase().trim();
          const targetFabric = existingFabrics.find(f => f.name.toLowerCase().trim() === fileName);
          
          if (targetFabric) {
              try {
                  const base64 = await compressImage(file, 2048, 0.9);
                  const updated = { ...targetFabric, mainImage: base64 };
                  await onSave(updated);
                  matchCount++;
              } catch (e) {
                  console.error("Error matching", fileName, e);
              }
          }
      }
      
      setIsSaving(false);
      alert(`¡Completado! Se han actualizado fotos para ${matchCount} telas.`);
      onClose();
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gray-50/50 sticky top-0 z-10">
            <button onClick={onClose} className="flex items-center gap-3 group text-gray-500 hover:text-black">
               <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center group-hover:border-black transition-colors">
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
               </div>
               <span className="text-[10px] font-bold uppercase tracking-widest">Cerrar</span>
            </button>

            <div className="flex bg-gray-200 p-1 rounded-full">
                <button onClick={() => setActiveTab('fabrics')} className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase transition-all ${activeTab === 'fabrics' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}>Telas</button>
                <button onClick={() => setActiveTab('matcher')} className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase transition-all ${activeTab === 'matcher' ? 'bg-blue-600 shadow-sm text-white' : 'text-gray-500'}`}>Llenar Fotos</button>
                <button onClick={() => setActiveTab('furniture')} className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase transition-all ${activeTab === 'furniture' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}>Muebles</button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
            {isSaving ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                    <p className="font-bold text-lg">{currentProgress}</p>
                    <p className="text-xs text-gray-400 mt-2">No cierres esta ventana mientras procesamos los archivos...</p>
                </div>
            ) : activeTab === 'matcher' ? (
                <div className="max-w-xl mx-auto text-center space-y-6 py-10">
                    <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4 4m0 0L8 8m4-4v12" /></svg>
                    </div>
                    <h2 className="font-serif text-3xl font-bold">Llenado Masivo de Fotos</h2>
                    <p className="text-gray-500 text-sm">
                        Si tienes una carpeta de fotos donde los archivos se llaman igual que las telas (ej. <strong>Alanis.jpg</strong>), súbelas aquí y la App las vinculará automáticamente.
                    </p>
                    
                    <div 
                        onClick={() => matcherInputRef.current?.click()}
                        className="border-2 border-dashed border-blue-200 rounded-3xl p-12 bg-blue-50/20 hover:bg-blue-50 cursor-pointer transition-all group"
                    >
                        {matchFiles.length > 0 ? (
                            <span className="font-bold text-blue-600 text-lg">¡{matchFiles.length} fotos seleccionadas!</span>
                        ) : (
                            <>
                                <svg className="w-12 h-12 text-blue-300 mx-auto mb-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                <span className="text-sm font-bold uppercase tracking-widest text-blue-400">Seleccionar fotos de mi PC</span>
                            </>
                        )}
                        <input ref={matcherInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => setMatchFiles(Array.from(e.target.files || []))} />
                    </div>

                    {matchFiles.length > 0 && (
                        <button 
                            onClick={handleMatchImages}
                            className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold uppercase tracking-widest text-sm shadow-xl hover:scale-105 transition-transform"
                        >
                            Comenzar Sincronización
                        </button>
                    )}
                </div>
            ) : (
                <p className="text-center text-gray-400 py-20 italic">Carga de fichas técnicas o muebles normales.</p>
            )}
        </div>
      </div>
    </div>
  );
};

export default UploadModal;
