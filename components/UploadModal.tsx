
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
  const [activeTab, setActiveTab] = useState<'fabrics' | 'furniture' | 'woods' | 'rugs'>('fabrics');
  
  // States for Fabrics & Rugs Processing
  const [step, setStep] = useState<'upload' | 'processing' | 'review'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [extractedFabrics, setExtractedFabrics] = useState<Partial<Fabric>[]>([]);
  const [currentProgress, setCurrentProgress] = useState<string>('');
  
  // States for Furniture
  const [furnName, setFurnName] = useState('');
  const [furnCategory, setFurnCategory] = useState('sofa');
  const [furnSupplier, setFurnSupplier] = useState('');
  const [furnImage, setFurnImage] = useState<string | null>(null);

  // States for Woods (Maderas)
  const [woodName, setWoodName] = useState(''); 
  const [woodSupplier, setWoodSupplier] = useState('');
  const [woodImage, setWoodImage] = useState<string | null>(null);

  // States for Rugs (Manual Single Upload fallback)
  const [rugName, setRugName] = useState('');
  const [rugSupplier, setRugSupplier] = useState('');
  const [rugImage, setRugImage] = useState<string | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); 
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
  const woodInputRef = useRef<HTMLInputElement>(null);
  const rugInputRef = useRef<HTMLInputElement>(null); // For single upload
  const rugFolderInputRef = useRef<HTMLInputElement>(null); // For mass upload
  const editFileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const toSentenceCase = (str: string) => str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';

  // --- LOGIC FOR FABRICS & COMMON ---
  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // --- LOGIC FOR RUGS MASS UPLOAD (UPDATED FOR T- PREFIX) ---
  const processRugFiles = async () => {
      if (files.length === 0) return;
      setStep('processing');
      
      try {
          // Structure: CollectionName -> Data
          const rugGroups: Record<string, { 
              name: string; 
              supplier: string; 
              files: File[]; 
              mainFile?: File;
              variants: { color: string, file: File, isMain: boolean }[];
          }> = {};

          // 1. ANALYZE AND GROUP FILES
          for (const file of files) {
              if (!file.type.startsWith('image/')) continue;
              
              const originalName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
              
              // HEURISTIC: Check for "T-" prefix which indicates Main/Top view
              const isTPrefix = originalName.startsWith('T-') || originalName.startsWith('t-');
              const isCSuffix = originalName.endsWith('_C') || originalName.endsWith('_c');
              
              // Clean name for parsing (Remove T- prefix if present)
              let cleanName = isTPrefix ? originalName.substring(2) : originalName;
              
              // Attempt to parse: Collection-Color-Variant
              // Common separators: - or _
              const parts = cleanName.split(/[-_]/);
              
              // Guess Collection Name (First part)
              let collectionName = toSentenceCase(parts[0]);
              
              // Fallback: If filenames are garbage (UUIDs), try to use the parent folder name
              if (collectionName.length < 3 || !isNaN(Number(collectionName))) {
                  const pathParts = (file.webkitRelativePath || "").split('/');
                  if (pathParts.length > 1) {
                      collectionName = toSentenceCase(pathParts[pathParts.length - 2]);
                  } else {
                      collectionName = "General";
                  }
              }

              // Guess Color (Second part usually, unless it's a number)
              let colorName = "General";
              if (parts.length > 1) {
                  // Filter out parts that are just numbers (sizes, indexes)
                  const potentialColorParts = parts.slice(1).filter(p => isNaN(Number(p)) && p.length > 1 && p.toUpperCase() !== 'C');
                  if (potentialColorParts.length > 0) {
                      colorName = toSentenceCase(potentialColorParts[0]);
                  }
              }

              // Init Group
              if (!rugGroups[collectionName]) {
                  rugGroups[collectionName] = {
                      name: collectionName,
                      supplier: "CREATA RUGS",
                      files: [],
                      variants: []
                  };
              }

              // Add to variants
              const isMain = isTPrefix || isCSuffix;
              rugGroups[collectionName].variants.push({
                  color: colorName,
                  file: file,
                  isMain: isMain
              });

              // Set global main file for the card (Priority: T- prefix)
              if (isMain) {
                  // If we already have a main file, but this one starts with T-, overwrite it (T- has highest priority)
                  if (!rugGroups[collectionName].mainFile || isTPrefix) {
                      rugGroups[collectionName].mainFile = file;
                  }
              }
          }

          const results: Partial<Fabric>[] = [];
          const keys = Object.keys(rugGroups);
          let processedCount = 0;

          // 2. PROCESS EACH GROUP INTO A FABRIC CARD
          for (const key of keys) {
              const group = rugGroups[key];
              processedCount++;
              setCurrentProgress(`Procesando Tapete: ${group.name} (${processedCount}/${keys.length})`);

              // If no specific main file found (no T- or _C), just use the first file
              const mainFileToUse = group.mainFile || group.variants[0].file;
              
              // Compress Main Image (Card View)
              const mainImageBase64 = await compressImage(mainFileToUse, 1200, 0.85);

              // Process Variants (Colors & Details)
              const colorImages: Record<string, string> = {};
              const colorsList: string[] = [];
              const seenColors = new Set<string>();

              // Sort variants: Main images first, then others
              const sortedVariants = group.variants.sort((a, b) => (a.isMain === b.isMain) ? 0 : a.isMain ? -1 : 1);

              for (const variant of sortedVariants) {
                  let finalColorName = variant.color;
                  
                  // If it's NOT a main image, append a suffix so it doesn't overwrite the main texture
                  if (!variant.isMain) {
                      // If we already have the "clean" color (from the T- file), name this "Ambiente" or "Detalle"
                      if (seenColors.has(variant.color)) {
                          finalColorName = `${variant.color} (Ambiente)`;
                          // Ensure uniqueness if multiple ambient photos
                          let counter = 2;
                          while(colorImages[finalColorName]) {
                              finalColorName = `${variant.color} (Vista ${counter})`;
                              counter++;
                          }
                      }
                  }

                  // Compress
                  const b64 = await compressImage(variant.file, 1000, 0.8);
                  colorImages[finalColorName] = b64;
                  colorsList.push(finalColorName);
                  seenColors.add(variant.color);
              }

              results.push({
                  name: group.name, // e.g. "Grunge"
                  supplier: group.supplier,
                  technicalSummary: `Colección: ${group.name}. Diseño contemporáneo.`,
                  specs: { 
                      composition: 'Tapete', 
                      martindale: 'N/A', 
                      usage: 'Interior',
                  },
                  colors: colorsList, // ["Ivory", "Ivory (Ambiente)", "Blue"]
                  colorImages: colorImages,
                  mainImage: mainImageBase64,
                  category: 'rug',
                  customCatalog: "Medidas: 160x230, 200x290" // Placeholder for manual edit
              });
          }

          setExtractedFabrics(results);
          setStep('review');

      } catch (e) {
          console.error("Error processing rugs", e);
          setStep('upload');
      }
  };

  const analyzeFileGroup = async (groupFiles: File[], groupName: string): Promise<Partial<Fabric>> => {
      // ... (Existing Fabric Logic)
      const pdfFile = groupFiles.find(f => f.type === 'application/pdf');
      const imgFiles = groupFiles.filter(f => f.type.startsWith('image/'));
      let rawData: any = { name: groupName, supplier: "", technicalSummary: "", specs: {} };

      let pdfBase64 = "";
      if (pdfFile) {
          try {
              pdfBase64 = await fileToBase64(pdfFile);
              rawData.pdfUrl = pdfBase64; 
          } catch(e) { console.warn("Error leyendo PDF", e); }
      }

      const analysisPromises = [];
      if (pdfFile && pdfBase64) {
          analysisPromises.push(async () => {
             try {
                const pdfData = await extractFabricData(pdfBase64.split(',')[1], 'application/pdf');
                return { type: 'pdf_analysis', data: pdfData };
             } catch(e) { return null; }
          });
      } else if (imgFiles.length > 0) {
          analysisPromises.push(async () => {
             try {
                const aiImg = await compressImage(imgFiles[0], 1280, 0.85); 
                const imgData = await extractFabricData(aiImg.split(',')[1], 'image/jpeg');
                return { type: 'img_analysis', data: imgData };
             } catch(e) { return null; }
          });
      }

      const analysisResults = await Promise.all(analysisPromises.map(p => p()));
      
      analysisResults.forEach(res => {
          if (res && res.data) {
              if (res.data.name) rawData.name = res.data.name;
              if (res.data.specs) rawData.specs = { ...rawData.specs, ...res.data.specs };
              if (res.data.supplier) rawData.supplier = res.data.supplier.toUpperCase();
              if (res.data.technicalSummary) rawData.technicalSummary = res.data.technicalSummary;
          }
      });

      if (rawData.name) rawData.name = toSentenceCase(rawData.name);

      const colorImages: Record<string, string> = {};
      const colors: string[] = [];

      const colorProcessingPromises = imgFiles.map(async (file) => {
          try {
              const base64 = await compressImage(file, 1600, 0.90);
              const extractionResult = await extractColorFromSwatch(base64.split(',')[1]);
              let detectedName = extractionResult.colorName;
              if (!detectedName || detectedName === 'Desconocido') {
                  detectedName = file.name.split('.')[0];
              }
              const formatted = toSentenceCase(detectedName);
              return {
                  name: formatted,
                  base64: base64,
                  supplierFound: extractionResult.supplierName
              };
          } catch (err) {
              const base64 = await compressImage(file, 1600, 0.90);
              return {
                  name: toSentenceCase(file.name.split('.')[0]),
                  base64: base64,
                  supplierFound: ''
              };
          }
      });

      const processedColors = await Promise.all(colorProcessingPromises);

      processedColors.forEach(item => {
          colorImages[item.name] = item.base64;
          colors.push(item.name);
          if (!rawData.supplier && item.supplierFound && item.supplierFound.length > 2) {
              rawData.supplier = item.supplierFound.toUpperCase();
          }
      });

      if (!rawData.supplier) rawData.supplier = "CONSULTAR";
      const mainImage = imgFiles.length > 0 ? colorImages[colors[0]] : '';

      return { ...rawData, colors, colorImages, mainImage, category: 'model' };
  };

  const processFiles = async () => {
    // Logic for FABRICS mass upload
    if (files.length === 0) return;
    setStep('processing');
    try {
      const groups: Record<string, File[]> = {};
      files.forEach(f => {
          const path = f.webkitRelativePath || f.name;
          const parts = path.split('/');
          let groupKey = parts.length > 1 ? parts[parts.length - 2] : 'General';
          if (groupKey === 'General') {
              const potentialName = f.name.split(/[_\- .]/)[0];
              if (potentialName && potentialName.length > 2 && !potentialName.startsWith('IMG')) {
                  groupKey = toSentenceCase(potentialName);
              }
          }
          if (!groups[groupKey]) groups[groupKey] = [];
          groups[groupKey].push(f);
      });

      const keys = Object.keys(groups);
      const results: Partial<Fabric>[] = [];
      const BATCH_SIZE = 2; 
      
      for (let i = 0; i < keys.length; i += BATCH_SIZE) {
          const batchKeys = keys.slice(i, i + BATCH_SIZE);
          setCurrentProgress(`Procesando bloque ${Math.floor(i/BATCH_SIZE) + 1} de ${Math.ceil(keys.length/BATCH_SIZE)}...`);
          const batchResults = await Promise.all(
              batchKeys.map(key => analyzeFileGroup(groups[key], key))
          );
          results.push(...batchResults);
      }

      setExtractedFabrics(results);
      setStep('review');
    } catch (e) {
      console.error("Error processing files", e);
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

  const removeExtractedFabric = (index: number) => {
    const updated = extractedFabrics.filter((_, i) => i !== index);
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
      const newColorName = "Nueva Variedad";
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
    setUploadStatusText('Guardando datos...');

    const hasWritePermission = await validateWriteAccess();
    if (!hasWritePermission) {
        setSaveError('BLOQUEADO: No tienes permiso de escritura.');
        setIsSaving(true); 
        return; 
    }

    setUploadProgress(5);
    const progressInterval = setInterval(() => {
        setUploadProgress(prev => (prev >= 90 ? 90 : prev + Math.random() * 2));
    }, 200);

    const finalFabrics: Fabric[] = extractedFabrics.map(data => {
        let finalMainImage = data.mainImage;
        if (!finalMainImage && data.colorImages) {
            const firstColorKey = Object.keys(data.colorImages)[0];
            if (firstColorKey) finalMainImage = data.colorImages[firstColorKey];
        }

        return {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            name: toSentenceCase(data.name || 'Sin Nombre'),
            supplier: (data.supplier || 'Consultar').toUpperCase(),
            technicalSummary: data.technicalSummary || '',
            specs: data.specs || { composition: '', martindale: '', usage: '' },
            colors: data.colors || [],
            colorImages: data.colorImages || {},
            mainImage: finalMainImage || '', 
            specsImage: data.specsImage,
            pdfUrl: data.pdfUrl,
            category: data.category as 'model' | 'wood' | 'rug' || 'model', 
            customCatalog: data.customCatalog 
        };
    });

    try {
        for (const fabric of finalFabrics) {
            await onSave(fabric);
            setUploadProgress(prev => Math.max(prev, 90)); 
        }
        clearInterval(progressInterval);
        setUploadProgress(100);
        setTimeout(() => { setIsSaving(false); window.location.reload(); }, 1000);
    } catch (err: any) {
        clearInterval(progressInterval);
        setSaveError(`Error: ${err.message}`);
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

  const handleWoodImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          try {
              const base64 = await compressImage(e.target.files[0], 1024, 0.85);
              setWoodImage(base64);
          } catch (err) { alert("Error procesando imagen"); }
      }
  };

  const handleSaveWoodInternal = async () => { /* ... existing code ... */ };
  const handleSaveRugInternal = async () => { /* ... existing code ... */ }; // We keep this for single manual upload fallback if needed, but UI will focus on mass now
  const handleSaveFurnitureInternal = async () => { /* ... existing code ... */ };

  const triggerFolderUpload = () => folderInputRef.current?.click();
  const triggerMobileUpload = () => mobileInputRef.current?.click();
  const triggerRugFolderUpload = () => rugFolderInputRef.current?.click();

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
        
        {/* HEADER */}
        {isSaving ? (
            <div className="h-4"></div>
        ) : (
            <div className="flex items-center justify-between px-8 py-6 bg-white sticky top-0 z-10">
                <button type="button" onClick={(e) => { e.preventDefault(); onClose(); }} className="flex items-center gap-3 group transition-all cursor-pointer">
                   <div className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center group-hover:bg-gray-100 transition-colors"><svg className="w-4 h-4 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg></div>
                   <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-900">Regresar</span>
                </button>
                <div className="flex bg-[#f2f2f2] p-1 rounded-full overflow-x-auto hide-scrollbar">
                    {['fabrics', 'furniture', 'woods', 'rugs'].map(tab => (
                        <button key={tab} onClick={() => { setActiveTab(tab as any); setStep('upload'); setFiles([]); setExtractedFabrics([]); }} className={`px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all whitespace-nowrap ${activeTab === tab ? 'bg-white shadow-sm text-slate-900' : 'text-gray-400 hover:text-gray-600'}`}>
                            {tab === 'fabrics' ? 'Telas' : tab === 'furniture' ? 'Muebles' : tab === 'woods' ? 'Maderas' : 'Tapetes'}
                        </button>
                    ))}
                </div>
            </div>
        )}

        <div className="flex-1 overflow-y-auto p-8 relative">
            {isSaving ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20">
                     <div className="w-full max-w-3xl px-12 text-center">
                        <div className="flex justify-between items-end mb-6"><span className={`text-sm font-bold uppercase tracking-[0.2em] ${saveError ? 'text-red-600' : 'text-slate-900'}`}>{saveError || uploadStatusText}</span><span className="text-xl font-bold text-slate-900">{Math.round(uploadProgress)}%</span></div>
                        <div className="w-full h-2 bg-gray-100 overflow-hidden mb-6 rounded-full"><div className={`h-full transition-all duration-300 ease-out ${saveError ? 'bg-red-500' : 'bg-slate-900'}`} style={{ width: `${uploadProgress}%` }}></div></div>
                        {saveError && <button onClick={() => setIsSaving(false)} className="mt-3 text-[10px] uppercase font-bold text-red-900 underline">Volver a intentar</button>}
                     </div>
                </div>
            ) : (activeTab === 'fabrics' || activeTab === 'rugs') ? (
                /* --- MASS UPLOAD UI (FABRICS & RUGS) --- */
                <>
                    {step === 'upload' && (
                      <div className="flex flex-col gap-8 h-full">
                          <div className="flex-1 flex flex-col items-center justify-center">
                              <div onClick={activeTab === 'fabrics' ? triggerFolderUpload : triggerRugFolderUpload} className="w-full max-w-2xl h-80 border-2 border-dashed border-gray-200 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-black hover:bg-gray-50 transition-all text-center group bg-white shadow-sm">
                                  <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"><svg className="w-10 h-10 text-gray-400 group-hover:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg></div>
                                  <span className="font-serif text-2xl font-bold mb-2">
                                      {activeTab === 'fabrics' ? 'Carga Masiva de Telas' : 'Carga Masiva de Tapetes'}
                                  </span>
                                  <p className="text-xs text-gray-400 uppercase tracking-widest max-w-sm">
                                      {activeTab === 'fabrics' ? 'Sube una carpeta con subcarpetas de telas.' : 'Sube la carpeta con todos los modelos y fotos dentro.'}
                                  </p>
                                  
                                  {activeTab === 'fabrics' ? (
                                      <input ref={folderInputRef} type="file" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} {...({ webkitdirectory: "", directory: "" } as any)} />
                                  ) : (
                                      <input ref={rugFolderInputRef} type="file" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} {...({ webkitdirectory: "", directory: "" } as any)} />
                                  )}
                              </div>
                              
                              {activeTab === 'fabrics' && (
                                  <div onClick={triggerMobileUpload} className="mt-6 text-blue-500 text-xs font-bold uppercase tracking-widest cursor-pointer hover:underline">
                                      O subir archivos sueltos
                                      <input ref={mobileInputRef} type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
                                  </div>
                              )}
                          </div>

                          {/* DANGER ZONE (Same as before) */}
                          {onReset && activeTab === 'fabrics' && (
                            <div className="mt-8 pt-6 border-t border-gray-100">
                                <h4 className="text-[10px] font-bold uppercase text-red-400 tracking-widest mb-3">Zona de Peligro</h4>
                                <button onClick={onReset} className="w-full py-4 border border-red-100 text-red-500 bg-red-50/50 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2 group shadow-sm"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>Borrar Telas</button>
                            </div>
                          )}
                      </div>
                    )}
                    
                    {step === 'processing' && (
                        <div className="text-center py-20">
                            <div className="animate-spin h-12 w-12 border-b-2 border-black mx-auto mb-6"></div>
                            <p className="text-lg font-serif italic">{currentProgress}</p>
                            <p className="text-xs text-gray-400 mt-2">{activeTab === 'rugs' ? 'Analizando nombres de archivo...' : 'Leyendo etiquetas con IA...'}</p>
                        </div>
                    )}

                    {step === 'review' && (
                        <div className="space-y-6 animate-fade-in pb-10">
                            <div className="flex items-center justify-between">
                                <h3 className="font-serif text-xl font-bold">Revisar {activeTab === 'fabrics' ? 'Telas' : 'Tapetes'} ({extractedFabrics.length})</h3>
                            </div>
                            
                            {extractedFabrics.map((f, i) => (
                                <div key={i} className="p-6 bg-white rounded-3xl border border-gray-200 shadow-sm relative">
                                    <button onClick={(e) => { e.stopPropagation(); removeExtractedFabric(i); }} className="absolute -top-3 -right-3 z-30 bg-white text-red-500 hover:bg-red-500 hover:text-white p-2 rounded-full shadow-md border border-gray-200 w-8 h-8 flex items-center justify-center"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>

                                    <div className="flex flex-col md:flex-row gap-6 items-start">
                                        <div onClick={() => triggerEditUpload(i, 'main')} className="w-32 h-40 rounded-xl overflow-hidden border border-gray-200 shrink-0 bg-gray-50 relative group cursor-pointer shadow-inner">
                                            <img src={f.mainImage} className="w-full h-full object-cover" alt="Main" />
                                            <div className="absolute inset-0 bg-black/40 hidden group-hover:flex items-center justify-center text-white text-xs font-bold uppercase">Cambiar</div>
                                        </div>

                                        <div className="flex-1 space-y-4 w-full">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1 tracking-widest">Nombre (Colección)</label>
                                                    <input value={f.name || ''} onChange={(e) => updateExtractedFabric(i, 'name', toSentenceCase(e.target.value))} className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 outline-none font-serif text-lg text-slate-900" />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1 tracking-widest">Proveedor</label>
                                                    <input value={f.supplier || ''} onChange={(e) => updateExtractedFabric(i, 'supplier', e.target.value.toUpperCase())} className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 outline-none font-sans text-sm uppercase font-bold" />
                                                </div>
                                            </div>

                                            {activeTab === 'rugs' ? (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1 tracking-widest">Modelo / SKU</label>
                                                        <input value={f.technicalSummary || ''} onChange={(e) => updateExtractedFabric(i, 'technicalSummary', e.target.value)} className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 outline-none text-sm" placeholder="Ej: Modelo: 41003 // 6161" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1 tracking-widest">Medidas</label>
                                                        <input value={f.customCatalog || ''} onChange={(e) => updateExtractedFabric(i, 'customCatalog', e.target.value)} className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 outline-none text-sm" placeholder="Ej: 160x230, 200x290" />
                                                    </div>
                                                </div>
                                            ) : (
                                                // Fabric specific fields
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div><label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Colección</label><input value={f.customCatalog || ''} onChange={(e) => updateExtractedFabric(i, 'customCatalog', e.target.value)} className="w-full p-3 bg-gray-50 rounded-lg border-gray-200 outline-none text-sm" /></div>
                                                </div>
                                            )}

                                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                                <div className="flex justify-between items-center mb-3">
                                                    <label className="block text-[10px] font-bold uppercase text-gray-400 tracking-widest">
                                                        {activeTab === 'rugs' ? 'Variantes y Vistas' : 'Colores'} ({f.colors?.length})
                                                    </label>
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
            ) : activeTab === 'furniture' ? (
                /* --- FURNITURE UI (No Changes) --- */
                <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
                    <div className="text-center mb-8"><h3 className="font-serif text-3xl font-bold mb-2">Nuevo Mueble</h3></div>
                    <div className="flex flex-col md:flex-row gap-8 items-start">
                        <div onClick={() => furnitureInputRef.current?.click()} className="w-full md:w-1/2 aspect-square bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 cursor-pointer flex flex-col items-center justify-center relative overflow-hidden group">
                            {furnImage ? <img src={furnImage} className="w-full h-full object-contain p-4" /> : <span className="text-xs font-bold uppercase text-gray-400">Subir Foto</span>}
                        </div>
                        <input ref={furnitureInputRef} type="file" accept="image/*" className="hidden" onChange={handleFurnitureImageChange} />
                        <div className="w-full md:w-1/2 space-y-6">
                            <input type="text" value={furnName} onChange={(e) => setFurnName(e.target.value)} placeholder="Nombre del Mueble" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-100 font-serif text-lg" />
                            <input type="text" value={furnCategory} onChange={(e) => setFurnCategory(e.target.value)} placeholder="Categoría (Sofá, Silla...)" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-100 font-serif text-sm" />
                            <input type="text" value={furnSupplier} onChange={(e) => setFurnSupplier(e.target.value)} placeholder="Proveedor" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-100 font-serif text-sm uppercase" />
                            <button onClick={handleSaveFurnitureInternal} disabled={!furnImage || !furnName} className="w-full bg-black text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-xl hover:scale-105 transition-transform disabled:opacity-50">Guardar Mueble</button>
                        </div>
                    </div>
                </div>
            ) : (
                /* --- WOODS UI (No Changes) --- */
                <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
                    <div className="text-center mb-8"><h3 className="font-serif text-3xl font-bold mb-2">Nueva Madera</h3></div>
                    <div className="flex flex-col md:flex-row gap-8 items-start">
                        <div onClick={() => woodInputRef.current?.click()} className="w-full md:w-1/2 aspect-square bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 cursor-pointer flex flex-col items-center justify-center relative overflow-hidden group">
                            {woodImage ? <img src={woodImage} className="w-full h-full object-cover rounded-2xl" /> : <span className="text-xs font-bold uppercase text-gray-400">Subir Textura</span>}
                        </div>
                        <input ref={woodInputRef} type="file" accept="image/*" className="hidden" onChange={handleWoodImageChange} />
                        <div className="w-full md:w-1/2 space-y-6">
                            <input type="text" value={woodName} onChange={(e) => setWoodName(e.target.value)} placeholder="Nombre / Color" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-100 font-serif text-lg" />
                            <input type="text" value={woodSupplier} onChange={(e) => setWoodSupplier(e.target.value)} placeholder="Proveedor" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-100 font-serif text-sm uppercase" />
                            <button onClick={handleSaveWoodInternal} disabled={!woodImage || !woodName} className="w-full bg-black text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-xl hover:scale-105 transition-transform disabled:opacity-50">Guardar Madera</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        
        {/* FOOTER ACTIONS */}
        {(activeTab === 'fabrics' || activeTab === 'rugs') && step !== 'upload' && !isSaving && (
            <div className="p-6 bg-white border-t border-gray-100 flex justify-end gap-4">
                <button onClick={() => setStep('upload')} className="text-gray-400 uppercase text-[10px] font-bold tracking-widest hover:text-black">Atrás</button>
                <button onClick={handleFinalSave} className="bg-black text-white px-8 py-3 rounded-xl font-bold uppercase text-[10px] tracking-widest shadow-lg hover:scale-105 transition-transform">Guardar todo en Nube</button>
            </div>
        )}
        {(activeTab === 'fabrics' || activeTab === 'rugs') && step === 'upload' && files.length > 0 && (
            <div className="p-6 bg-white text-center border-t border-gray-100">
                <button onClick={activeTab === 'fabrics' ? processFiles : processRugFiles} className="bg-black text-white px-10 py-4 rounded-xl font-bold uppercase tracking-widest shadow-xl hover:scale-105 transition-transform">
                    {activeTab === 'fabrics' ? `Procesar ${files.length} archivos con IA` : `Procesar ${files.length} archivos de tapetes`}
                </button>
            </div>
        )}
      </div>

      <input ref={editFileInputRef} type="file" className="hidden" onChange={handleEditFileChange} />
    </div>
  );
};

export default UploadModal;
