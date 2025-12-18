
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
  const [activeTab, setActiveTab] = useState<'fabrics' | 'furniture'>('fabrics');
  const [step, setStep] = useState<'upload' | 'processing' | 'review'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [extractedFabrics, setExtractedFabrics] = useState<Partial<Fabric>[]>([]);
  const [currentProgress, setCurrentProgress] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const toSentenceCase = (str: string) => str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';

  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const analyzeFileGroup = async (groupFiles: File[], groupName: string): Promise<Partial<Fabric>> => {
      const pdfFile = groupFiles.find(f => f.type === 'application/pdf');
      const imgFiles = groupFiles.filter(f => f.type.startsWith('image/'));
      let rawData: any = { name: groupName, supplier: "CONSULTAR", technicalSummary: "", specs: {} };

      try {
        if (pdfFile) {
            const base64Data = await fileToBase64(pdfFile);
            rawData = await extractFabricData(base64Data.split(',')[1], 'application/pdf');
        } else if (imgFiles.length > 0) {
            const aiImg = await compressImage(imgFiles[0], 1024, 0.85);
            rawData = await extractFabricData(aiImg.split(',')[1], 'image/jpeg');
        }
      } catch (e) {}

      if (rawData.name) rawData.name = toSentenceCase(rawData.name);
      if (rawData.supplier) rawData.supplier = rawData.supplier.toUpperCase();

      const colorImages: Record<string, string> = {};
      const colors: string[] = [];
      for (const file of imgFiles) {
          const base64 = await compressImage(file, 2048, 0.9);
          const detectedName = await extractColorFromSwatch(base64.split(',')[1]) || file.name.split('.')[0];
          const formatted = toSentenceCase(detectedName);
          colorImages[formatted] = base64;
          colors.push(formatted);
      }

      return { ...rawData, colors, colorImages, mainImage: imgFiles.length > 0 ? colorImages[colors[0]] : '', category: 'model' };
  };

  const processFiles = async () => {
    if (files.length === 0) return;
    setStep('processing');
    try {
      const groups: Record<string, File[]> = {};
      files.forEach(f => {
          const path = f.webkitRelativePath || f.name;
          const parts = path.split('/');
          const groupKey = parts.length > 1 ? parts[parts.length - 2] : 'General';
          if (!groups[groupKey]) groups[groupKey] = [];
          groups[groupKey].push(f);
      });

      const keys = Object.keys(groups);
      const results: Partial<Fabric>[] = [];
      for (let i = 0; i < keys.length; i++) {
          setCurrentProgress(`Analizando ${keys[i]} (${i+1}/${keys.length})...`);
          results.push(await analyzeFileGroup(groups[keys[i]], keys[i]));
      }
      setExtractedFabrics(results);
      setStep('review');
    } catch (e) {
      setStep('upload');
    }
  };

  const handleFinalSave = async () => {
    setIsSaving(true);
    const finalFabrics: Fabric[] = extractedFabrics.map(data => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        name: toSentenceCase(data.name || 'Sin Nombre'),
        supplier: (data.supplier || 'Consultar').toUpperCase(),
        technicalSummary: data.technicalSummary || '',
        specs: data.specs || { composition: '', martindale: '', usage: '' },
        colors: data.colors || [],
        colorImages: data.colorImages || {},
        mainImage: data.mainImage || '',
        category: 'model',
    }));
    if (onBulkSave) await onBulkSave(finalFabrics);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex flex-col border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center justify-between px-8 py-5">
                <h2 className="font-serif text-2xl font-bold text-slate-900">Gestión de Catálogo</h2>
                <button onClick={onClose} className="text-gray-400 p-2"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
            {isSaving ? (
                <div className="flex flex-col items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mb-4"></div>
                    <p className="font-bold">Guardando catálogo...</p>
                </div>
            ) : (
                <>
                    {step === 'upload' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full items-center">
                          <div onClick={() => folderInputRef.current?.click()} className="h-64 border-2 border-dashed border-gray-200 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-black hover:bg-gray-50 transition-all text-center group">
                              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><svg className="w-8 h-8 text-gray-400 group-hover:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg></div>
                              <span className="font-serif text-xl font-bold">Carga Masiva (PC)</span>
                              <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-widest">Sube carpetas completas</p>
                              {/* @ts-ignore */}
                              <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
                          </div>

                          <div onClick={() => mobileInputRef.current?.click()} className="h-64 border-2 border-dashed border-blue-200 bg-blue-50/20 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all text-center group">
                              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                              <span className="font-serif text-xl font-bold">Carga Masiva (Móvil)</span>
                              <p className="text-[10px] text-blue-400 mt-2 uppercase tracking-widest">Selecciona múltiples fotos</p>
                              <input ref={mobileInputRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
                          </div>
                      </div>
                    )}
                    {step === 'processing' && (
                        <div className="text-center py-20">
                            <div className="animate-spin h-12 w-12 border-b-2 border-black mx-auto mb-6"></div>
                            <p className="text-lg font-serif italic">{currentProgress}</p>
                            <p className="text-xs text-gray-400 mt-2">La IA está analizando las texturas y nombres...</p>
                        </div>
                    )}
                    {step === 'review' && (
                        <div className="space-y-4">
                            <h3 className="font-serif text-xl mb-4">Revisa las telas detectadas ({extractedFabrics.length})</h3>
                            {extractedFabrics.map((f, i) => (
                                <div key={i} className="p-4 bg-gray-50 rounded-2xl flex gap-4 items-center border border-gray-100">
                                    <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 shadow-sm"><img src={f.mainImage} className="w-full h-full object-cover" /></div>
                                    <div className="flex-1">
                                        <p className="font-bold text-slate-800">{f.name}</p>
                                        <p className="text-[10px] uppercase text-gray-400 font-bold tracking-widest">{f.supplier}</p>
                                    </div>
                                    <div className="text-[10px] bg-white px-2 py-1 rounded-full border border-gray-200">{f.colors?.length} colores</div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
        
        {step !== 'upload' && !isSaving && (
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-4">
                <button onClick={() => setStep('upload')} className="text-gray-400 uppercase text-xs font-bold tracking-widest hover:text-black">Atrás</button>
                <button onClick={handleFinalSave} className="bg-black text-white px-8 py-3 rounded-xl font-bold uppercase text-xs tracking-widest shadow-lg hover:scale-105 transition-transform">Guardar todo en Nube</button>
            </div>
        )}
        {step === 'upload' && files.length > 0 && (
            <div className="p-6 bg-gray-50 text-center border-t border-gray-100">
                <button onClick={processFiles} className="bg-black text-white px-10 py-4 rounded-xl font-bold uppercase tracking-widest shadow-xl hover:scale-105 transition-transform">Procesar {files.length} archivos con IA</button>
            </div>
        )}
      </div>
    </div>
  );
};

export default UploadModal;
