import React, { useState, useRef } from 'react';
import { extractFabricData, extractColorFromSwatch } from '../services/geminiService';
import { MASTER_FABRIC_DB } from '../constants';
import { Fabric } from '../types';
import { compressImage } from '../utils/imageCompression';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (fabric: Fabric) => Promise<void> | void;
  onBulkSave?: (fabrics: Fabric[]) => Promise<void> | void;
  onReset?: () => void;
  existingFabrics?: Fabric[]; // Add existing fabrics for duplicate checking
}

const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onSave, onBulkSave, onReset, existingFabrics = [] }) => {
  const [step, setStep] = useState<'upload' | 'processing' | 'review'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [extractedFabrics, setExtractedFabrics] = useState<Partial<Fabric>[]>([]);
  const [currentProgress, setCurrentProgress] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'model' | 'wood'>('model');
  const [activeUpload, setActiveUpload] = useState<{ 
      fabricIndex: number; 
      type: 'main' | 'color' | 'add_color'; 
      colorName?: string; 
  } | null>(null);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const singleImageInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Helper to force Sentence Case (First upper, rest lower)
  const toSentenceCase = (str: string) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  // Helper to check for duplicates
  const isDuplicate = (name: string) => {
    if (!name || existingFabrics.length === 0) return false;
    return existingFabrics.some(f => f.name.toLowerCase().trim() === name.toLowerCase().trim());
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleMobileFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        const newFiles: File[] = Array.from(e.target.files);
        // Append unique files to allow massive batching from different folders
        setFiles((prev: File[]) => {
            const existingKeys = new Set(prev.map((f) => f.name + '-' + f.size));
            const uniqueNew = newFiles.filter((f) => !existingKeys.has(f.name + '-' + f.size));
            return [...prev, ...uniqueNew];
        });
    }
    // Reset input to allow selecting same files again if needed
    if (mobileInputRef.current) mobileInputRef.current.value = '';
  };
  
  const handleSingleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && activeUpload) {
        try {
            const file = e.target.files[0];
            const { fabricIndex, type, colorName } = activeUpload;
            
            // HIGH QUALITY: 2560px, 0.95 quality
            const base64 = await compressImage(file, 2560, 0.95);

            setExtractedFabrics(prev => {
                const updated = [...prev];
                const fabric = { ...updated[fabricIndex] };
                
                if (type === 'main') {
                    fabric.mainImage = base64;
                } else if (type === 'color' && colorName) {
                    const newImages = { ...fabric.colorImages, [colorName]: base64 };
                    fabric.colorImages = newImages;
                } else if (type === 'add_color') {
                    const rawName = window.prompt("Nombre del nuevo color:", `Color ${(fabric.colors?.length || 0) + 1}`);
                    if (rawName) {
                        const newName = toSentenceCase(rawName); // Force casing
                        const newColors = [...(fabric.colors || []), newName];
                        const newImages = { ...fabric.colorImages, [newName]: base64 };
                        fabric.colors = newColors;
                        fabric.colorImages = newImages;
                    }
                }
                
                updated[fabricIndex] = fabric;
                return updated;
            });

        } catch (err) {
            console.error("Error updating image", err);
        }
        setActiveUpload(null);
        if (singleImageInputRef.current) singleImageInputRef.current.value = '';
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const analyzeFileGroup = async (groupFiles: File[], groupName: string): Promise<Partial<Fabric>> => {
      const pdfFile = groupFiles.find(f => f.type === 'application/pdf');
      const imgFiles = groupFiles.filter(f => f.type.startsWith('image/'));

      let rawData: any = { name: "Unknown", supplier: "Unknown", technicalSummary: "", specs: {} };

      // 1. Extract Info (Keep standard quality for AI to be fast)
      try {
        if (pdfFile) {
            const base64Data = await fileToBase64(pdfFile);
            rawData = await extractFabricData(base64Data.split(',')[1], 'application/pdf');
            if (base64Data.length < 1000000) { 
                rawData.pdfUrl = base64Data;
            }
        } else if (imgFiles.length > 0) {
            const aiAnalysisImg = await compressImage(imgFiles[0], 1024, 0.85);
            rawData = await extractFabricData(aiAnalysisImg.split(',')[1], 'image/jpeg');
        }
      } catch (e: any) {
          console.warn(`Extraction failed for ${groupName}`, e?.message || "Unknown error");
      }

      const cleanFabricName = (inputName: string) => {
          if (!inputName) return "";
          return inputName.replace(/^(fromatex|fotmatex|formatex|creata)[_\-\s]*/i, '').trim();
      };

      if (rawData.name && rawData.name !== "Unknown") {
          rawData.name = cleanFabricName(rawData.name);
      }
      if (!rawData.name || rawData.name === "Unknown") {
          rawData.name = cleanFabricName(groupName); 
      }
      
      // Auto-Format Name to Sentence Case
      if (rawData.name) {
          rawData.name = toSentenceCase(rawData.name);
      }
      
      // Auto-Format Supplier to Uppercase immediately
      if (rawData.supplier) {
          rawData.supplier = rawData.supplier.toUpperCase();
      } else {
          rawData.supplier = "CONSULTAR";
      }

      let dbColors: string[] = [];
      const dbName = Object.keys(MASTER_FABRIC_DB).find(
        key => key.toLowerCase() === rawData.name?.toLowerCase()
      );

      if (dbName) {
        dbColors = [...MASTER_FABRIC_DB[dbName]];
        rawData.name = dbName; // Use DB casing if available
      }

      const colorImages: Record<string, string> = {};
      const detectedColorsList: string[] = [];
      
      let processedCount = 0;
      for (const file of imgFiles) {
        processedCount++;
        if (processedCount % 3 === 0) {
             setCurrentProgress(`Escaneando colores (${processedCount}/${imgFiles.length}) para ${rawData.name}...`);
        }

        try {
            // HIGH QUALITY STORAGE: 2560px, 0.95
            const base64Img = await compressImage(file, 2560, 0.95);
            
            // For OCR, we can use the same string or a smaller one, but let's reuse to keep it simple
            // We pass split base64 to AI
            let detectedName = await extractColorFromSwatch(base64Img.split(',')[1]);
            
            if (!detectedName) {
                const fileNameLower = file.name.toLowerCase().replace(/\.[^/.]+$/, "");
                if (dbColors.length > 0) {
                     const matchedColor = dbColors.find(color => fileNameLower.includes(color.toLowerCase()));
                     if (matchedColor) detectedName = matchedColor;
                }
                if (!detectedName) {
                    let cleanColorName = fileNameLower;
                    if (rawData.name) {
                        const nameRegex = new RegExp(`^${rawData.name}[_\\-\\s]*`, 'i');
                        cleanColorName = cleanColorName.replace(nameRegex, '');
                    }
                    cleanColorName = cleanColorName.replace(/^(fromatex|fotmatex|formatex|creata)[_\-\s]*/i, '');
                    const cleanName = cleanColorName.replace(/[-_]/g, " ").trim();
                    detectedName = cleanName;
                }
            }

            if (detectedName && dbColors.length > 0) {
                 const exactMatch = dbColors.find(c => c.toLowerCase() === detectedName!.toLowerCase().trim());
                 if (exactMatch) detectedName = exactMatch;
            }

            if (detectedName) {
                // Ensure Sentence Case for colors
                const formattedColor = toSentenceCase(detectedName);

                if (!colorImages[formattedColor]) {
                    colorImages[formattedColor] = base64Img;
                    detectedColorsList.push(formattedColor);
                }
            }
        } catch (imgError) {
            console.warn(`Failed to process image ${file.name}`, imgError);
        }
      }

      if (dbName && dbColors.length > 0) {
           detectedColorsList.sort(); 
      } else {
           detectedColorsList.sort();
      }

      let mainImageToUse = '';
      if (Object.keys(colorImages).length > 0) {
          mainImageToUse = Object.values(colorImages)[0];
      } else if (imgFiles.length > 0) {
          try {
            mainImageToUse = await compressImage(imgFiles[0], 2560, 0.95);
          } catch(e) {
            mainImageToUse = '';
          }
      }

      return {
          ...rawData,
          colors: detectedColorsList,
          colorImages: colorImages,
          mainImage: mainImageToUse,
          category: selectedCategory,
          customCatalog: '' 
      };
  };

  const processFiles = async () => {
    if (files.length === 0) return;
    setStep('processing');
    setExtractedFabrics([]);

    try {
      const groups: Record<string, File[]> = {};
      
      files.forEach(f => {
          // Check if it's a folder upload (PC) or flat file upload (Mobile)
          const relativePath = f.webkitRelativePath || "";
          const parts = relativePath.split('/');
          
          let key = 'root';
          if (parts.length > 2) key = parts[1]; // Subfolder
          else if (parts.length === 2) key = 'root'; // Root of folder
          // If parts length is 0 or 1 (flat file), it stays 'root'
          
          if (!groups[key]) groups[key] = [];
          groups[key].push(f);
      });

      const groupKeys = Object.keys(groups);
      const results: Partial<Fabric>[] = [];

      for (let i = 0; i < groupKeys.length; i++) {
          const key = groupKeys[i];
          const groupFiles = groups[key];
          if (!groupFiles.some(f => f.type.startsWith('image/') || f.type === 'application/pdf')) continue;
          
          setCurrentProgress(`Analizando ${key !== 'root' ? key : 'archivos'} (${i + 1}/${groupKeys.length})...`);
          
          // Determine group name. If we are in 'root', try to get folder name from first file, or default to 'Nueva Tela'
          let derivedGroupName = key;
          if (key === 'root') {
              const firstPath = groupFiles[0].webkitRelativePath || "";
              derivedGroupName = firstPath.split('/')[0] || 'Nueva Tela';
          }

          const fabricData = await analyzeFileGroup(groupFiles, derivedGroupName);
          results.push(fabricData);
      }
      setExtractedFabrics(results);
      setStep('review');
    } catch (err: any) {
      console.error("Processing error:", err?.message || "Unknown error");
      alert('Error procesando archivos. Intenta de nuevo.');
      setStep('upload');
    }
  };

  const removeFabricFromReview = (index: number) => {
      setExtractedFabrics(prev => prev.filter((_, i) => i !== index));
  };

  const updateFabricField = (index: number, field: keyof Fabric, value: any) => {
      setExtractedFabrics(prev => {
          const updated = [...prev];
          let finalValue = value;

          // Apply Strict Casing Rules on Input during Review
          if (field === 'name') {
              finalValue = toSentenceCase(value);
          } else if (field === 'supplier' || field === 'customCatalog') {
              finalValue = value.toUpperCase();
          }

          updated[index] = { ...updated[index], [field]: finalValue };
          return updated;
      });
  };

  const handleFinalSave = async () => {
    if (extractedFabrics.length === 0) return;
    setIsSaving(true);
    try {
        const finalFabrics: Fabric[] = extractedFabrics.map(data => ({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: toSentenceCase(data.name || 'Sin Nombre'), // Ensure Sentence Case
            supplier: (data.supplier || 'Consultar').toUpperCase(), // Ensure Uppercase
            // CHANGE: Defaults are now empty strings, not placeholder text
            technicalSummary: data.technicalSummary || '',
            specs: data.specs || { composition: '', martindale: '', usage: '' },
            colors: data.colors ? data.colors.map(toSentenceCase) : [], // Ensure Colors are Sentence Case
            colorImages: data.colorImages || {},
            mainImage: data.mainImage || '',
            category: selectedCategory,
            customCatalog: (data.customCatalog || '').toUpperCase(), // Ensure Uppercase
            pdfUrl: data.pdfUrl
        }));

        if (finalFabrics.length === 1) {
            await onSave(finalFabrics[0]);
        } else if (finalFabrics.length > 1 && onBulkSave) {
            await onBulkSave(finalFabrics);
        }
        
        setTimeout(() => {
            setStep('upload');
            setFiles([]);
            setExtractedFabrics([]);
            onClose();
        }, 500);

    } catch (error: any) {
        console.error("Save error:", error?.message || "Unknown error");
        alert("Ocurrió un error al guardar.");
    } finally {
        setIsSaving(false);
    }
  };

  const triggerUpload = (fabricIndex: number, type: 'main' | 'color' | 'add_color', colorName?: string) => {
      setActiveUpload({ fabricIndex, type, colorName });
      singleImageInputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      {/* 
         Fixed: Added min-h-[600px] and max-h-[90vh] with flex layout to prevent collapsing.
         This ensures the modal always looks substantial like the screenshot.
      */}
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden relative flex flex-col h-auto min-h-[600px] max-h-[90vh]">
        
        {/* Header Section */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100 bg-gray-50/50">
            <div>
                <h2 className="font-serif text-2xl font-bold text-slate-900 leading-tight">
                    {step === 'review' ? 'Revisar Información' : 'Subir Archivos'}
                </h2>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mt-1">
                    {step === 'review' ? 'Confirma los datos extraídos antes de guardar' : 'Agrega imágenes o carpetas al catálogo'}
                </p>
            </div>
            {!isSaving && (
                <button onClick={onClose} className="text-gray-400 hover:text-black hover:bg-gray-100 rounded-full p-2 transition-colors">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-8 bg-white relative">
            {isSaving ? (
                 <div className="flex flex-col items-center justify-center h-full space-y-6 text-center animate-fade-in">
                    <div className="relative">
                        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-black"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                             <div className="w-8 h-8 bg-gray-100 rounded-full"></div>
                        </div>
                    </div>
                    <div>
                        <p className="font-serif text-2xl font-bold text-slate-800">Guardando...</p>
                        <p className="text-sm text-gray-400 mt-2 font-medium tracking-wide">Procesando imágenes de ALTA RESOLUCIÓN.</p>
                    </div>
                 </div>
            ) : (
                <>
                    {step === 'upload' && (
                      <div className="flex flex-col h-full">
                        {files.length > 0 ? (
                            /* STATE: FILES SELECTED */
                             <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-fade-in-up">
                                 <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center border border-green-100 shadow-sm">
                                    <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                 </div>
                                 <div className="text-center">
                                     <h3 className="font-serif text-3xl font-bold text-slate-800">{files.length} archivos listos</h3>
                                     <p className="text-sm text-gray-500 mt-2">¿Deseas agregar más o comenzar el análisis?</p>
                                 </div>
                                 
                                 <div className="flex flex-col w-full max-w-md gap-3">
                                    <button 
                                        onClick={() => mobileInputRef.current?.click()}
                                        className="w-full py-4 px-6 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                        Agregar Más
                                    </button>
                                    <button 
                                        onClick={() => setFiles([])}
                                        className="w-full py-4 px-6 bg-white border border-red-100 text-red-400 rounded-xl text-xs font-bold hover:bg-red-50 hover:text-red-600 transition-colors uppercase tracking-widest"
                                    >
                                        Cancelar Selección
                                    </button>
                                 </div>
                             </div>
                        ) : (
                            /* STATE: NO FILES - Showing Large Cards */
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full items-center">
                                {/* PC UPLOAD OPTION */}
                                <div 
                                    onClick={() => folderInputRef.current?.click()}
                                    className="h-64 border-2 border-dashed border-gray-200 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-black hover:bg-gray-50 transition-all group text-center"
                                >
                                    <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-white group-hover:shadow-md transition-all">
                                        <svg className="w-8 h-8 text-gray-400 group-hover:text-black transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                    </div>
                                    <span className="font-serif text-xl font-bold text-slate-800">Carpeta Completa</span>
                                    <p className="text-xs text-gray-400 mt-2 font-medium uppercase tracking-wide">
                                      Ideal para PC (Estructura de Carpetas)
                                    </p>
                                    {/* @ts-ignore */}
                                    <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple className="hidden" onChange={handleFolderChange} />
                                </div>

                                {/* MOBILE UPLOAD OPTION */}
                                <div 
                                    onClick={() => mobileInputRef.current?.click()}
                                    className="h-64 border-2 border-dashed border-blue-200 bg-blue-50/30 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all group text-center"
                                >
                                    <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-white group-hover:shadow-md transition-all">
                                        <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    </div>
                                    <span className="font-serif text-xl font-bold text-blue-900">Archivos Sueltos</span>
                                    <p className="text-xs text-blue-400 mt-2 font-medium uppercase tracking-wide">
                                      Ideal para Móvil / Fotos / Drive
                                    </p>
                                    <input ref={mobileInputRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={handleMobileFilesChange} />
                                </div>
                            </div>
                        )}
                      </div>
                    )}
                    
                    {step === 'processing' && (
                        <div className="flex flex-col items-center justify-center h-full space-y-8 animate-fade-in">
                            <div className="relative w-24 h-24">
                                <svg className="animate-spin w-full h-full text-gray-200" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center font-bold text-xs">AI</div>
                            </div>
                            <div className="text-center max-w-sm mx-auto">
                                <h3 className="font-serif text-2xl font-bold text-slate-800 mb-2">Analizando Información...</h3>
                                <p className="text-sm text-gray-500">{currentProgress || "Extrayendo datos y colores..."}</p>
                            </div>
                        </div>
                    )}

                    {step === 'review' && (
                         <div className="space-y-6 pb-24">
                             <div className="bg-green-50 border border-green-100 p-4 rounded-xl flex items-center gap-3">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <p className="text-sm text-green-800 font-medium">Se detectaron <strong>{extractedFabrics.length}</strong> modelos nuevos.</p>
                             </div>
                             
                             {extractedFabrics.map((f, i) => {
                                 const duplicateWarning = isDuplicate(f.name || '');
                                 return (
                                 <div key={i} className="flex flex-col gap-6 p-6 bg-gray-50 rounded-3xl border border-gray-100 hover:bg-white hover:shadow-xl transition-all relative group">
                                     {duplicateWarning && (
                                        <div className="absolute top-4 right-4 z-20 bg-red-100 text-red-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border border-red-200 flex items-center gap-1">
                                            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                                            Duplicado
                                        </div>
                                     )}

                                     <div className="flex flex-col md:flex-row gap-6">
                                        <div className="relative group/img w-32 h-32 flex-shrink-0 mx-auto md:mx-0">
                                            <div className="w-full h-full bg-gray-200 rounded-2xl overflow-hidden shadow-sm border border-gray-200">
                                                {f.mainImage ? (
                                                    <img src={f.mainImage} alt="Main" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs font-bold uppercase">Sin Foto</div>
                                                )}
                                            </div>
                                            <button 
                                                onClick={() => triggerUpload(i, 'main')}
                                                className="absolute bottom-2 right-2 w-8 h-8 bg-white text-black rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform opacity-0 group-hover/img:opacity-100"
                                                title="Cambiar imagen"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                            </button>
                                        </div>

                                        <div className="flex-1 space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Nombre Modelo</label>
                                                    <input 
                                                        type="text" 
                                                        value={f.name} 
                                                        onChange={(e) => updateFabricField(i, 'name', e.target.value)}
                                                        className={`w-full p-3 bg-white rounded-xl border font-serif text-lg font-bold focus:ring-1 focus:ring-black outline-none ${duplicateWarning ? 'border-red-300 text-red-900' : 'border-gray-200 text-slate-900'}`}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Proveedor</label>
                                                    <input 
                                                        type="text" 
                                                        value={f.supplier} 
                                                        onChange={(e) => updateFabricField(i, 'supplier', e.target.value)}
                                                        className="w-full p-3 bg-white rounded-xl border border-gray-200 text-sm font-bold uppercase tracking-widest text-gray-600 focus:ring-1 focus:ring-black outline-none"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Catálogo</label>
                                                <input 
                                                    type="text" 
                                                    value={f.customCatalog || ''} 
                                                    onChange={(e) => updateFabricField(i, 'customCatalog', e.target.value)}
                                                    className="w-full p-3 bg-white rounded-xl border border-gray-200 text-sm font-medium uppercase text-blue-600 focus:ring-1 focus:ring-blue-500 outline-none placeholder:text-gray-300"
                                                    placeholder="OPCIONAL (EJ: VERANO 2024)"
                                                />
                                            </div>

                                            <div className="bg-white p-4 rounded-xl border border-gray-100">
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className="text-[10px] uppercase font-bold text-gray-400">{f.colors?.length || 0} Colores Detectados</span>
                                                    <button 
                                                        onClick={() => triggerUpload(i, 'add_color')}
                                                        className="text-[10px] bg-black text-white px-2 py-1 rounded hover:bg-gray-800 transition-colors"
                                                    >
                                                        + Agregar
                                                    </button>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {f.colors?.map((c, idx) => (
                                                        <div 
                                                            key={idx} 
                                                            onClick={() => triggerUpload(i, 'color', c)}
                                                            className="w-8 h-8 rounded-full border border-gray-200 cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-black relative group/col overflow-hidden"
                                                            title={c}
                                                        >
                                                            {f.colorImages && f.colorImages[c] ? (
                                                                <img src={f.colorImages[c]} alt={c} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full bg-gray-100"></div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => removeFabricFromReview(i)}
                                                    className="text-[10px] text-red-400 hover:text-red-600 font-bold uppercase tracking-wider hover:underline"
                                                >
                                                    Eliminar Ficha
                                                </button>
                                            </div>
                                        </div>
                                     </div>
                                 </div>
                                 );
                             })}
                         </div>
                    )}
                </>
            )}
        </div>

        {/* Footer Actions */}
        {!isSaving && step !== 'processing' && (
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-4">
                {step === 'upload' ? (
                    <>
                        <button 
                             onClick={onReset}
                             className="text-gray-400 hover:text-red-500 text-xs font-bold uppercase tracking-widest transition-colors"
                        >
                            Resetear DB
                        </button>
                        <button 
                            onClick={processFiles}
                            disabled={files.length === 0}
                            className="bg-black text-white px-8 py-4 rounded-xl font-bold uppercase tracking-wide text-sm hover:scale-105 transition-transform shadow-lg disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
                        >
                            Comenzar Análisis
                        </button>
                    </>
                ) : step === 'review' ? (
                    <>
                        <button 
                            onClick={() => { setStep('upload'); setFiles([]); }}
                            className="text-gray-500 hover:text-black font-bold uppercase text-xs tracking-widest px-4"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleFinalSave}
                            disabled={extractedFabrics.length === 0}
                            className="bg-black text-white px-8 py-4 rounded-xl font-bold uppercase tracking-wide text-sm hover:scale-105 transition-transform shadow-lg disabled:opacity-50 disabled:scale-100"
                        >
                            Guardar {extractedFabrics.length} Fichas
                        </button>
                    </>
                ) : null}
            </div>
        )}

        <input ref={singleImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleSingleImageChange} />
      </div>
    </div>
  );
};

export default UploadModal;