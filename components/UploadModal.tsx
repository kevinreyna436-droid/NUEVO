
import React, { useState, useRef, useEffect } from 'react';
import { extractFabricData, extractColorFromSwatch } from '../services/geminiService';
import { Fabric, FurnitureTemplate } from '../types';
import { compressImage } from '../utils/imageCompression';
import { validateWriteAccess } from '../services/firebase';

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
  
  // States for Fabrics
  const [step, setStep] = useState<'upload' | 'processing' | 'review'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [extractedFabrics, setExtractedFabrics] = useState<Partial<Fabric>[]>([]);
  const [currentProgress, setCurrentProgress] = useState<string>('');
  
  // States for Furniture
  const [furnName, setFurnName] = useState('');
  const [furnCategory, setFurnCategory] = useState('sofa');
  const [furnSupplier, setFurnSupplier] = useState('');
  const [furnImage, setFurnImage] = useState<string | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // 0-100%
  const [uploadStatusText, setUploadStatusText] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Upload helpers
  const [uploadTarget, setUploadTarget] = useState<{
    fabricIndex: number;
    type: 'main' | 'color' | 'specsImage' | 'pdfUrl';
    colorIndex?: number;
  } | null>(null);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const furnitureInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const toSentenceCase = (str: string) => str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';

  // --- LOGIC FOR FABRICS ---
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
            const aiImg = await compressImage(imgFiles[0], 800, 0.6);
            rawData = await extractFabricData(aiImg.split(',')[1], 'image/jpeg');
        }
      } catch (e) {}

      if (rawData.name) rawData.name = toSentenceCase(rawData.name);
      if (rawData.supplier) rawData.supplier = rawData.supplier.toUpperCase();

      const colorImages: Record<string, string> = {};
      const colors: string[] = [];
      for (const file of imgFiles) {
          const base64 = await compressImage(file, 1024, 0.7);
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

  // --- EDITING LOGIC ---
  const updateExtractedFabric = (index: number, field: keyof Fabric, value: any) => {
    const updated = extractedFabrics.map((item, idx) => 
       idx === index ? { ...item, [field]: value } : item
    );
    setExtractedFabrics(updated);
  };

  const updateFabricColor = (fabricIndex: number, colorIndex: number, newNameRaw: string) => {
    const newName = toSentenceCase(newNameRaw);
    const updated = [...extractedFabrics];
    const fabric = { ...updated[fabricIndex] };
    
    if (fabric.colors && fabric.colorImages) {
        const oldName = fabric.colors[colorIndex];
        const newColors = [...fabric.colors];
        newColors[colorIndex] = newName;
        const newImages = { ...fabric.colorImages };
        if (newImages[oldName]) {
            newImages[newName] = newImages[oldName];
            delete newImages[oldName];
        }
        fabric.colors = newColors;
        fabric.colorImages = newImages;
        updated[fabricIndex] = fabric;
        setExtractedFabrics(updated);
    }
  };

  const handleEditFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && uploadTarget) {
        const file = e.target.files[0];
        const { fabricIndex, type, colorIndex } = uploadTarget;
        let result: string = "";

        if (type === 'pdfUrl') {
             if (file.type !== 'application/pdf') { alert("Solo PDF"); return; }
             result = await fileToBase64(file);
        } else {
             result = await compressImage(file, 1024, 0.7);
        }

        const updated = [...extractedFabrics];
        const fabric = { ...updated[fabricIndex] };

        if (type === 'main') fabric.mainImage = result;
        else if (type === 'specsImage') fabric.specsImage = result;
        else if (type === 'pdfUrl') fabric.pdfUrl = result;
        else if (type === 'color' && typeof colorIndex === 'number' && fabric.colors) {
            const colorName = fabric.colors[colorIndex];
            fabric.colorImages = { ...fabric.colorImages, [colorName]: result };
        }
        
        updated[fabricIndex] = fabric;
        setExtractedFabrics(updated);
        setUploadTarget(null);
        if (editFileInputRef.current) editFileInputRef.current.value = '';
    }
  };

  const triggerEditUpload = (fabricIndex: number, type: 'main' | 'color' | 'specsImage' | 'pdfUrl', colorIndex?: number) => {
      setUploadTarget({ fabricIndex, type, colorIndex });
      if (editFileInputRef.current) {
          editFileInputRef.current.accept = type === 'pdfUrl' ? 'application/pdf' : 'image/*';
          editFileInputRef.current.click();
      }
  };

  const handleAddColor = (fabricIndex: number) => {
      const updated = [...extractedFabrics];
      const fabric = updated[fabricIndex];
      const newColorName = "Nuevo Color";
      fabric.colors = [...(fabric.colors || []), newColorName];
      if (fabric.mainImage) fabric.colorImages = { ...fabric.colorImages, [newColorName]: fabric.mainImage };
      updated[fabricIndex] = fabric;
      setExtractedFabrics(updated);
  };

  const handleRemoveColor = (fabricIndex: number, colorIndex: number) => {
      const updated = [...extractedFabrics];
      const fabric = updated[fabricIndex];
      if (!fabric.colors) return;
      const colorToRemove = fabric.colors[colorIndex];
      const newColors = fabric.colors.filter((_, i) => i !== colorIndex);
      const newImages = { ...fabric.colorImages };
      delete newImages[colorToRemove];
      fabric.colors = newColors;
      fabric.colorImages = newImages;
      updated[fabricIndex] = fabric;
      setExtractedFabrics(updated);
  };

  const isDuplicate = (name: string) => {
      if (!name) return false;
      return existingFabrics.some(f => f.name.trim().toLowerCase() === name.trim().toLowerCase());
  };

  const handleFinalSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setUploadProgress(0);
    setUploadStatusText('Verificando conexión...');

    // 1. Validar Permisos ANTES de empezar
    const hasWritePermission = await validateWriteAccess();
    if (!hasWritePermission) {
        setSaveError('BLOQUEADO: No tienes permiso de escritura en la Nube.');
        setUploadStatusText('REVISA TU CONFIGURACIÓN FIREBASE (REGLAS)');
        setIsSaving(true); // Keep UI open to show error
        return; // STOP HERE
    }

    setUploadProgress(5);
    
    // Simulate initial progress
    const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
            if (prev >= 90) return 90;
            return prev + Math.random() * 2; 
        });
    }, 200);

    const finalFabrics: Fabric[] = extractedFabrics.map(data => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        name: toSentenceCase(data.name || 'Sin Nombre'),
        supplier: (data.supplier || 'Consultar').toUpperCase(),
        technicalSummary: data.technicalSummary || '',
        specs: data.specs || { composition: '', martindale: '', usage: '' },
        colors: data.colors || [],
        colorImages: data.colorImages || {},
        mainImage: data.mainImage || '',
        specsImage: data.specsImage,
        pdfUrl: data.pdfUrl,
        category: 'model',
        customCatalog: data.customCatalog 
    }));

    const total = finalFabrics.length;
    let completed = 0;

    try {
        for (const fabric of finalFabrics) {
            setUploadStatusText(`SINCRONIZANDO ${fabric.name.toUpperCase()}... (${completed + 1}/${total})`);
            await onSave(fabric);
            completed++;
            setUploadProgress(prev => Math.max(prev, 90)); 
        }

        clearInterval(progressInterval);
        setUploadProgress(100);
        setUploadStatusText('¡COMPLETADO!');
        
        setTimeout(() => {
            setIsSaving(false);
            window.location.reload();
        }, 1000);

    } catch (err: any) {
        clearInterval(progressInterval);
        console.error("Error guardando tela:", err);
        
        // Handle Permission Error explicitly for UI
        // Check for both permission-denied (Firestore) and unauthorized (Storage)
        if (err.message && (err.message.includes('permission-denied') || err.message.includes('unauthorized'))) {
            setSaveError('ERROR: PERMISO DENEGADO (STORAGE/DB)');
            setUploadStatusText('Faltan reglas de escritura en Storage o Database.');
        } else {
            setSaveError(`Error: ${err.message || "Fallo de conexión"}`);
        }
        
        // DO NOT RELOAD PAGE ON ERROR - Let user see the message
    }
  };

  const handleFurnitureImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          try {
              const base64 = await compressImage(e.target.files[0], 1024, 0.7);
              setFurnImage(base64);
          } catch (err) { alert("Error procesando imagen"); }
      }
  };

  const handleSaveFurnitureInternal = async () => {
      if (!furnName || !furnImage) { alert("Datos incompletos"); return; }
      
      const hasWrite = await validateWriteAccess();
      if(!hasWrite) {
          alert("Error: No tienes permiso para escribir en la base de datos.");
          return;
      }

      setIsSaving(true);
      setUploadProgress(10);
      setUploadStatusText('SUBIENDO MUEBLE...');

      const interval = setInterval(() => {
        setUploadProgress(prev => (prev >= 90 ? 90 : prev + 5));
      }, 200);

      const newFurniture: FurnitureTemplate = {
          id: `furn-${Date.now()}`,
          name: toSentenceCase(furnName),
          category: furnCategory,
          imageUrl: furnImage,
          supplier: furnSupplier ? furnSupplier.toUpperCase() : 'CREATA INTERNAL'
      };
      
      try {
        if (onSaveFurniture) await onSaveFurniture(newFurniture);
        clearInterval(interval);
        setUploadProgress(100);
        setTimeout(() => {
             window.location.reload();
        }, 800);
      } catch (err: any) {
          clearInterval(interval);
          setIsSaving(false);
           if (err.message && (err.message.includes('permission-denied') || err.message.includes('unauthorized'))) {
            alert("Error: Reglas de Storage/DB insuficientes.");
          } else {
            alert("Error guardando mueble.");
          }
      }
  };

  const triggerFolderUpload = () => folderInputRef.current?.click();
  const triggerMobileUpload = () => mobileInputRef.current?.click();

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div 
        className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()} 
      >
        {/* HEADER */}
        {isSaving ? (
            <div className="h-4"></div>
        ) : (
            <div className="flex items-center justify-between px-8 py-6 bg-white sticky top-0 z-10">
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); onClose(); }}
                  className="flex items-center gap-3 group transition-all cursor-pointer"
                >
                   <div className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center group-hover:bg-gray-100 transition-colors">
                       <svg className="w-4 h-4 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                       </svg>
                   </div>
                   <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-900">Regresar</span>
                </button>

                <div className="flex bg-[#f2f2f2] p-1 rounded-full">
                    <button 
                        onClick={() => setActiveTab('fabrics')}
                        className={`px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${activeTab === 'fabrics' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        Telas
                    </button>
                    <button 
                        onClick={() => setActiveTab('furniture')}
                        className={`px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${activeTab === 'furniture' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        Muebles
                    </button>
                </div>
            </div>
        )}

        <div className="flex-1 overflow-y-auto p-8 relative">
            {isSaving ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20">
                     <div className="w-full max-w-lg px-8 text-center">
                        <div className="flex justify-between items-end mb-4">
                             <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${saveError ? 'text-red-600' : 'text-slate-900'}`}>
                                {saveError || uploadStatusText}
                             </span>
                             <span className="text-sm font-bold text-slate-900">{Math.round(uploadProgress)}%</span>
                        </div>
                        
                        <div className="w-full h-[2px] bg-gray-100 overflow-hidden mb-4">
                            <div 
                                className={`h-full transition-all duration-300 ease-out ${saveError ? 'bg-red-500' : 'bg-slate-900'}`}
                                style={{ width: `${uploadProgress}%` }}
                            ></div>
                        </div>
                        
                        {saveError ? (
                            <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-left mt-4 animate-fade-in">
                                <p className="text-xs text-red-800 font-bold mb-2">La subida se ha detenido.</p>
                                <p className="text-[10px] text-red-700 leading-relaxed">
                                    Parece que tu base de datos o almacenamiento tiene reglas restrictivas. Debes configurar las <strong>Reglas de Seguridad</strong> en tu consola de Firebase.
                                </p>
                                <button onClick={() => setIsSaving(false)} className="mt-3 text-[10px] uppercase font-bold text-red-900 underline">Volver a intentar</button>
                            </div>
                        ) : (
                            <p className="text-[10px] text-gray-400 font-medium tracking-wide">
                                Optimizando imágenes para carga rápida...
                            </p>
                        )}
                     </div>
                </div>
            ) : activeTab === 'fabrics' ? (
                /* --- FABRICS UI --- */
                <>
                    {step === 'upload' && (
                      <div className="flex flex-col gap-8 h-full">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center flex-1">
                              <div onClick={triggerFolderUpload} className="h-64 border-2 border-dashed border-gray-200 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-black hover:bg-gray-50 transition-all text-center group">
                                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><svg className="w-8 h-8 text-gray-400 group-hover:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg></div>
                                  <span className="font-serif text-xl font-bold">Carga Masiva (PC)</span>
                                  <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-widest">Sube carpetas completas</p>
                                  
                                  <input 
                                    ref={folderInputRef} 
                                    type="file" 
                                    className="hidden" 
                                    onChange={(e) => setFiles(Array.from(e.target.files || []))}
                                    {...({ webkitdirectory: "", directory: "" } as any)}
                                  />
                              </div>

                              <div onClick={triggerMobileUpload} className="h-64 border-2 border-dashed border-blue-200 bg-blue-50/20 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all text-center group">
                                  <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                                  <span className="font-serif text-xl font-bold">Carga Masiva (Móvil)</span>
                                  <p className="text-[10px] text-blue-400 mt-2 uppercase tracking-widest">Selecciona múltiples fotos</p>
                                  <input ref={mobileInputRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
                              </div>
                          </div>

                          {/* DANGER ZONE */}
                          {onReset && (
                            <div className="mt-8 pt-6 border-t border-gray-100">
                                <h4 className="text-[10px] font-bold uppercase text-red-400 tracking-widest mb-3">Zona de Peligro</h4>
                                <button 
                                    onClick={onReset}
                                    className="w-full py-4 border border-red-100 text-red-500 bg-red-50/50 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2 group shadow-sm"
                                >
                                    <svg className="w-4 h-4 group-hover:animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    Borrar Todo el Catálogo y Restaurar
                                </button>
                            </div>
                          )}
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
                        <div className="space-y-6 animate-fade-in pb-10">
                            <div className="flex items-center justify-between">
                                <h3 className="font-serif text-xl font-bold">Revisa y edita las telas detectadas ({extractedFabrics.length})</h3>
                                <p className="text-xs text-gray-400">Puedes modificar los nombres antes de guardar.</p>
                            </div>
                            
                            {extractedFabrics.map((f, i) => (
                                <div key={i} className="p-6 bg-white rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition-all relative">
                                    {isDuplicate(f.name || '') && (
                                        <div className="absolute top-4 right-4 bg-red-100 text-red-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-red-200 flex items-center gap-1 shadow-sm z-10">
                                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                                            Repetida
                                        </div>
                                    )}

                                    <div className="flex flex-col md:flex-row gap-6 items-start">
                                        <div 
                                            onClick={() => triggerEditUpload(i, 'main')}
                                            className="w-24 h-24 rounded-2xl overflow-hidden border border-gray-200 shrink-0 bg-gray-50 relative group cursor-pointer"
                                        >
                                            <img src={f.mainImage} className="w-full h-full object-cover" alt="Fabric" />
                                            <div className="absolute inset-0 bg-black/40 hidden group-hover:flex items-center justify-center">
                                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                            </div>
                                        </div>

                                        <div className="flex-1 space-y-5 w-full">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1.5 tracking-widest">Nombre Modelo</label>
                                                    <input 
                                                        value={f.name || ''} 
                                                        onChange={(e) => updateExtractedFabric(i, 'name', toSentenceCase(e.target.value))}
                                                        className={`w-full p-2.5 bg-gray-50 rounded-lg border outline-none font-serif text-lg text-slate-900 ${isDuplicate(f.name || '') ? 'border-red-300' : 'border-gray-200'}`}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1.5 tracking-widest">Proveedor</label>
                                                    <input 
                                                        value={f.supplier || ''} 
                                                        onChange={(e) => updateExtractedFabric(i, 'supplier', e.target.value.toUpperCase())}
                                                        className="w-full p-2.5 bg-gray-50 rounded-lg border border-gray-200 outline-none font-sans text-sm uppercase font-bold text-slate-700"
                                                    />
                                                </div>
                                            </div>

                                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                                <div className="flex justify-between items-center mb-3">
                                                    <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-widest">Colores ({f.colors?.length})</label>
                                                    <button onClick={() => handleAddColor(i)} className="text-[10px] font-bold uppercase text-blue-600 hover:underline">+ Agregar</button>
                                                </div>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                    {f.colors?.map((color, colorIdx) => (
                                                        <div key={colorIdx} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-200 group/item">
                                                            <div onClick={() => triggerEditUpload(i, 'color', colorIdx)} className="w-8 h-8 rounded-md overflow-hidden shrink-0 border border-gray-100 cursor-pointer">
                                                                <img src={f.colorImages?.[color]} className="w-full h-full object-cover" />
                                                            </div>
                                                            <input value={color} onChange={(e) => updateFabricColor(i, colorIdx, e.target.value)} className="w-full text-xs font-medium outline-none bg-transparent min-w-0" />
                                                            <button onClick={() => handleRemoveColor(i, colorIdx)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100 px-1">×</button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                /* --- FURNITURE UI --- */
                <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
                    <div className="text-center mb-8">
                        <h3 className="font-serif text-3xl font-bold mb-2">Nuevo Mueble</h3>
                    </div>
                    <div className="flex flex-col md:flex-row gap-8 items-start">
                        <div onClick={() => furnitureInputRef.current?.click()} className="w-full md:w-1/2 aspect-square bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 cursor-pointer flex flex-col items-center justify-center relative overflow-hidden group">
                            {furnImage ? (
                                <img src={furnImage} className="w-full h-full object-contain p-4" />
                            ) : (
                                <span className="text-xs font-bold uppercase text-gray-400">Subir Foto</span>
                            )}
                        </div>
                        <input ref={furnitureInputRef} type="file" accept="image/*" className="hidden" onChange={handleFurnitureImageChange} />

                        <div className="w-full md:w-1/2 space-y-6">
                            <input type="text" value={furnName} onChange={(e) => setFurnName(e.target.value)} placeholder="Nombre del Mueble" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-100 font-serif text-lg" />
                            <input type="text" value={furnCategory} onChange={(e) => setFurnCategory(e.target.value)} placeholder="Categoría (Sofá, Silla...)" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-100 font-serif text-sm" />
                            <button onClick={handleSaveFurnitureInternal} disabled={!furnImage || !furnName} className="w-full bg-black text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-xl hover:scale-105 transition-transform disabled:opacity-50">Guardar Mueble</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        
        {/* FOOTER ACTIONS */}
        {activeTab === 'fabrics' && step !== 'upload' && !isSaving && (
            <div className="p-6 bg-white border-t border-gray-100 flex justify-end gap-4">
                <button onClick={() => setStep('upload')} className="text-gray-400 uppercase text-[10px] font-bold tracking-widest hover:text-black">Atrás</button>
                <button onClick={handleFinalSave} className="bg-black text-white px-8 py-3 rounded-xl font-bold uppercase text-[10px] tracking-widest shadow-lg hover:scale-105 transition-transform">Guardar todo en Nube</button>
            </div>
        )}
        {activeTab === 'fabrics' && step === 'upload' && files.length > 0 && (
            <div className="p-6 bg-white text-center border-t border-gray-100">
                <button onClick={processFiles} className="bg-black text-white px-10 py-4 rounded-xl font-bold uppercase tracking-widest shadow-xl hover:scale-105 transition-transform">Procesar {files.length} archivos con IA</button>
            </div>
        )}
      </div>

      <input ref={editFileInputRef} type="file" className="hidden" onChange={handleEditFileChange} />
    </div>
  );
};

export default UploadModal;
