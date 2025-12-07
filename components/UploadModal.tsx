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
}

const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onSave, onBulkSave, onReset }) => {
  const [step, setStep] = useState<'upload' | 'processing' | 'review'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  // Store multiple extracted fabrics for bulk mode
  const [extractedFabrics, setExtractedFabrics] = useState<Partial<Fabric>[]>([]);
  const [currentProgress, setCurrentProgress] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  
  // NEW: Manual Category State
  const [selectedCategory, setSelectedCategory] = useState<'model' | 'wood'>('model');
  
  // NEW: State to track which item has specs expanded
  const [expandedSpecsIndex, setExpandedSpecsIndex] = useState<number | null>(null);
  
  // NEW: State to track active image upload target
  const [activeUpload, setActiveUpload] = useState<{ 
      fabricIndex: number; 
      type: 'main' | 'color' | 'add_color'; 
      colorName?: string; 
  } | null>(null);

  // Ref for directory upload
  const folderInputRef = useRef<HTMLInputElement>(null);
  // Ref for single image replacement
  const singleImageInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const uploadedFiles: File[] = Array.from(e.target.files);
      setFiles(uploadedFiles);
    }
  };
  
  const handleSingleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && activeUpload) {
        try {
            const file = e.target.files[0];
            const { fabricIndex, type, colorName } = activeUpload;
            
            // Adjust quality based on type to save space
            // Main image high res, Color swatches lower res
            const quality = type === 'main' ? 0.85 : 0.80;
            const size = type === 'main' ? 2048 : 600;

            const base64 = await compressImage(file, size, quality);
            

            setExtractedFabrics(prev => {
                const updated = [...prev];
                const fabric = { ...updated[fabricIndex] };
                
                if (type === 'main') {
                    fabric.mainImage = base64;
                } else if (type === 'color' && colorName) {
                    const newImages = { ...fabric.colorImages, [colorName]: base64 };
                    fabric.colorImages = newImages;
                } else if (type === 'add_color') {
                    const newName = window.prompt("Nombre del nuevo color:", `Color ${(fabric.colors?.length || 0) + 1}`);
                    if (newName) {
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

  // Logic to process a specific group of files (representing one fabric)
  const analyzeFileGroup = async (groupFiles: File[], groupName: string): Promise<Partial<Fabric>> => {
      const pdfFile = groupFiles.find(f => f.type === 'application/pdf');
      const imgFiles = groupFiles.filter(f => f.type.startsWith('image/'));

      let rawData: any = { name: "Unknown", supplier: "Unknown", technicalSummary: "", specs: {} };

      // 1. Extract Info from PDF or First Image (AI Analysis)
      try {
        if (pdfFile) {
            const base64Data = await fileToBase64(pdfFile);
            rawData = await extractFabricData(base64Data.split(',')[1], 'application/pdf');
            // Store PDF URL if extracted from PDF directly
            if (base64Data.length < 1000000) { // Limit size for auto-attach
                rawData.pdfUrl = base64Data;
            }
        } else if (imgFiles.length > 0) {
            const base64Data = await fileToBase64(imgFiles[0]);
            rawData = await extractFabricData(base64Data.split(',')[1], imgFiles[0].type);
        }
      } catch (e: any) {
          console.warn(`Extraction failed for ${groupName}`, e?.message || "Unknown error");
      }

      // HELPER: Remove "Fromatex", "Fotmatex" prefix if present manually as fallback
      const cleanFabricName = (inputName: string) => {
          if (!inputName) return "";
          return inputName.replace(/^(fromatex|fotmatex|formatex|creata)[_\-\s]*/i, '').trim();
      };

      // Clean extracted name
      if (rawData.name && rawData.name !== "Unknown") {
          rawData.name = cleanFabricName(rawData.name);
      }

      // 2. Name Inference Fallback
      if (!rawData.name || rawData.name === "Unknown") {
          rawData.name = cleanFabricName(groupName); 
      }

      // 3. Cross-reference DB with SMART MATCHING
      let dbColors: string[] = [];
      const dbName = Object.keys(MASTER_FABRIC_DB).find(
        key => key.toLowerCase() === rawData.name?.toLowerCase()
      );

      if (dbName) {
        dbColors = [...MASTER_FABRIC_DB[dbName]];
        rawData.name = dbName;
      }

      // 4. Map Images to Colors (USING OCR)
      const colorImages: Record<string, string> = {};
      const detectedColorsList: string[] = [];
      
      let processedCount = 0;
      for (const file of imgFiles) {
        processedCount++;
        // Update progress inside the loop because OCR takes time
        if (processedCount % 3 === 0) {
             setCurrentProgress(`Escaneando colores (${processedCount}/${imgFiles.length}) para ${rawData.name}...`);
        }

        try {
            // REDUCED SIZE FOR COLORS TO 600px TO PREVENT FIRESTORE BLOAT
            const base64Img = await compressImage(file, 600, 0.85);
            
            // --- AI OCR STEP ---
            let detectedName = await extractColorFromSwatch(base64Img.split(',')[1]);
            
            // If AI failed to read text, fallback to filename logic
            if (!detectedName) {
                const fileNameLower = file.name.toLowerCase().replace(/\.[^/.]+$/, "");
                
                // If we have DB colors, try to match filename substring
                if (dbColors.length > 0) {
                     const matchedColor = dbColors.find(color => fileNameLower.includes(color.toLowerCase()));
                     if (matchedColor) detectedName = matchedColor;
                }
                
                // If still no name, just clean the filename
                if (!detectedName) {
                    let cleanColorName = fileNameLower;
                    if (rawData.name) {
                        const nameRegex = new RegExp(`^${rawData.name}[_\\-\\s]*`, 'i');
                        cleanColorName = cleanColorName.replace(nameRegex, '');
                    }
                    cleanColorName = cleanColorName.replace(/^(fromatex|fotmatex|formatex|creata)[_\-\s]*/i, '');
                    const cleanName = cleanColorName.replace(/[-_]/g, " ").trim();
                    detectedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
                }
            }

            // Normalization
            if (detectedName && dbColors.length > 0) {
                 const exactMatch = dbColors.find(c => c.toLowerCase() === detectedName!.toLowerCase().trim());
                 if (exactMatch) detectedName = exactMatch;
            }

            if (detectedName) {
                // Avoid overwriting if multiple images map to same color
                if (!colorImages[detectedName]) {
                    colorImages[detectedName] = base64Img;
                    detectedColorsList.push(detectedName);
                }
            }

        } catch (imgError) {
            console.warn(`Failed to process image ${file.name}`, imgError);
        }
      }

      // Restore alphabetical order or DB order
      if (dbName && dbColors.length > 0) {
           detectedColorsList.sort(); 
      } else {
           detectedColorsList.sort();
      }

      // Main Image Selection - Keep High Quality
      let mainImageToUse = '';
      if (Object.keys(colorImages).length > 0) {
          // If we are using a color image as main, we might want to re-compress it higher quality if we have the original file ref,
          // but here we just use what we have. Ideally main image is separate.
          mainImageToUse = Object.values(colorImages)[0];
      } else if (imgFiles.length > 0) {
          try {
            // Explicitly compress the first found image as high res for Main Image
            mainImageToUse = await compressImage(imgFiles[0], 2048, 0.85);
          } catch(e) {
            mainImageToUse = '';
          }
      } else {
          mainImageToUse = ''; 
      }

      return {
          ...rawData,
          colors: detectedColorsList,
          colorImages: colorImages,
          mainImage: mainImageToUse,
          category: selectedCategory, // USE SELECTED CATEGORY
          customCatalog: '' // Initialize custom catalog as empty
      };
  };

  const processFiles = async () => {
    if (files.length === 0) return;
    setStep('processing');
    setExtractedFabrics([]);

    try {
      // 1. Group files by immediate subfolder relative to upload root
      const groups: Record<string, File[]> = {};
      
      files.forEach(f => {
          const parts = f.webkitRelativePath.split('/');
          let key = 'root';
          if (parts.length > 2) {
              key = parts[1]; // The immediate subfolder inside the root
          } else if (parts.length === 2) {
              key = 'root';
          }
          
          if (!groups[key]) groups[key] = [];
          groups[key].push(f);
      });

      const groupKeys = Object.keys(groups);
      const results: Partial<Fabric>[] = [];

      for (let i = 0; i < groupKeys.length; i++) {
          const key = groupKeys[i];
          const groupFiles = groups[key];
          
          // Skip if no useful files
          if (!groupFiles.some(f => f.type.startsWith('image/') || f.type === 'application/pdf')) continue;

          setCurrentProgress(`Analizando ${key !== 'root' ? key : 'archivos base'} (${i + 1}/${groupKeys.length})...`);
          
          const fabricData = await analyzeFileGroup(groupFiles, key === 'root' ? (groupFiles[0].webkitRelativePath.split('/')[0] || 'Unknown') : key);
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
          updated[index] = { ...updated[index], [field]: value };
          return updated;
      });
  };

  const cleanUpAndClose = () => {
      setStep('upload');
      setFiles([]);
      setExtractedFabrics([]);
      onClose();
  };

  const handleFinalSave = async () => {
    if (extractedFabrics.length === 0) {
        alert("No hay telas seleccionadas para guardar.");
        return;
    }
    
    setIsSaving(true);
    
    try {
        const finalFabrics: Fabric[] = extractedFabrics.map(data => ({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: data.name || 'Sin Nombre',
            supplier: data.supplier || 'Consultar',
            technicalSummary: data.technicalSummary || 'Sin datos técnicos disponibles.',
            specs: data.specs || { composition: 'N/A', martindale: 'N/A', usage: 'N/A' },
            colors: data.colors || [],
            colorImages: data.colorImages || {},
            mainImage: data.mainImage || '',
            category: selectedCategory, // Ensure consistency
            customCatalog: data.customCatalog, // Save custom catalog
            pdfUrl: data.pdfUrl // Persist PDF if present
        }));

        if (finalFabrics.length === 1) {
            await onSave(finalFabrics[0]);
        } else if (finalFabrics.length > 1 && onBulkSave) {
            await onBulkSave(finalFabrics);
        } else {
            for (const f of finalFabrics) {
                await onSave(f);
            }
        }
        
        // Wait a tick to ensure UI updates
        setTimeout(() => {
            cleanUpAndClose();
        }, 500);

    } catch (error: any) {
        console.error("Save error:", error?.message || "Unknown error");
        alert("Ocurrió un error al guardar en la nube.");
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
      <div className="bg-white w-full max-w-4xl rounded-3xl p-8 shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]">
        {!isSaving && (
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-black">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        )}

        <h2 className="font-serif text-3xl mb-2 text-primary text-center flex-shrink-0">
            {step === 'review' ? 'Revisar antes de Guardar' : 'Subir Archivos'}
        </h2>
        {/* NEW: Category Selector */}
        {step === 'upload' && !isSaving && (
            <div className="flex justify-center mb-6">
                <div className="flex bg-gray-100 p-1 rounded-full">
                    <button 
                        onClick={() => setSelectedCategory('model')}
                        className={`px-6 py-2 rounded-full text-sm font-bold uppercase transition-all ${selectedCategory === 'model' ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                        Colección Textil
                    </button>
                    <button 
                         onClick={() => setSelectedCategory('wood')}
                        className={`px-6 py-2 rounded-full text-sm font-bold uppercase transition-all ${selectedCategory === 'wood' ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                        Colección Maderas
                    </button>
                </div>
            </div>
        )}


        {isSaving ? (
             <div className="flex flex-col items-center justify-center flex-1 h-64 space-y-6 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
                <div>
                    <p className="font-serif text-lg font-bold">Guardando en Catálogo...</p>
                    <p className="text-xs text-gray-400 mt-2">Subiendo imágenes de alta calidad paso a paso.</p>
                </div>
             </div>
        ) : (
            <>
                {step === 'upload' && (
                  <div className="space-y-6 flex-1 overflow-y-auto">
                    <div 
                        onClick={() => folderInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-300 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors h-64 text-center"
                    >
                        {files.length > 0 ? (
                            <>
                                <svg className="w-12 h-12 text-green-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <p className="font-bold text-lg">{files.length} archivos seleccionados</p>
                                <p className="text-sm text-gray-500 mt-2">Puede contener múltiples carpetas</p>
                            </>
                        ) : (
                            <>
                                <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                <span className="font-medium text-lg text-gray-600">Seleccionar Carpeta Maestra</span>
                                <p className="text-xs text-gray-400 mt-2">Sube una carpeta con subcarpetas de telas</p>
                            </>
                        )}
                        {/* @ts-ignore */}
                        <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple className="hidden" onChange={handleFolderChange} />
                    </div>

                    <button 
                      onClick={processFiles}
                      disabled={files.length === 0}
                      className="w-full bg-primary text-white py-4 rounded-xl font-bold tracking-wide hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase"
                    >
                      Analizar Información
                    </button>
                    
                    {onReset && (
                        <div className="pt-4 border-t border-gray-100 mt-4 text-center">
                            <button 
                                onClick={onReset}
                                className="text-red-400 text-xs font-bold uppercase tracking-widest hover:text-red-600 hover:underline"
                            >
                                Resetear Catálogo (Borrar Todo)
                            </button>
                        </div>
                    )}
                  </div>
                )}

                {step === 'processing' && (
                  <div className="flex flex-col items-center justify-center h-64 space-y-6 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
                    <div>
                        <p className="font-serif text-lg animate-pulse">Analizando con Gemini AI...</p>
                        <p className="text-xs text-gray-400 mt-2">{currentProgress}</p>
                    </div>
                  </div>
                )}

                {step === 'review' && (
                  <div className="flex flex-col h-full overflow-hidden">
                     <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                         <div className="bg-green-50 p-4 rounded-xl mb-4 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-serif text-green-800">¡Análisis Completo!</h3>
                                <p className="text-xs text-green-600">Se han detectado {extractedFabrics.length} modelos. Revisa y selecciona qué subir.</p>
                            </div>
                            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                         </div>
                         
                         {extractedFabrics.map((f, i) => (
                             <div key={i} className="flex flex-col gap-4 p-6 bg-gray-50 rounded-3xl border border-gray-100 transition-all hover:shadow-lg hover:bg-white relative">
                                 <div className="flex flex-col md:flex-row gap-6">
                                    {/* Main Image with + Button */}
                                    <div className="relative group">
                                        <div className="w-24 h-24 md:w-32 md:h-32 flex-shrink-0 bg-gray-200 rounded-2xl overflow-hidden shadow-sm">
                                            {f.mainImage ? (
                                                <img src={f.mainImage} alt="Main" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Img</div>
                                            )}
                                        </div>
                                        {/* Circular Plus Button for Main Image */}
                                        <button 
                                            onClick={() => triggerUpload(i, 'main')}
                                            className="absolute -top-3 -left-3 w-8 h-8 bg-white text-blue-600 rounded-full flex items-center justify-center shadow-md border border-gray-100 hover:scale-110 transition-transform z-10"
                                            title="Cambiar imagen principal"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                        </button>
                                    </div>

                                    {/* Edit Fields - Restyled */}
                                    <div className="flex-1 flex flex-col space-y-3">
                                        <div className="flex flex-col gap-2">
                                            {/* Name Input - Boxed and Larger (5% bigger) */}
                                            <input 
                                                type="text" 
                                                value={f.name} 
                                                onChange={(e) => updateFabricField(i, 'name', e.target.value)}
                                                className="w-full p-4 bg-white rounded-xl border border-gray-200 font-serif text-3xl font-bold focus:ring-2 focus:ring-black focus:border-transparent outline-none shadow-sm transition-all"
                                                placeholder="Nombre del Modelo"
                                            />
                                            {/* Supplier Input - Boxed and Larger */}
                                            <input 
                                                type="text" 
                                                value={f.supplier} 
                                                onChange={(e) => updateFabricField(i, 'supplier', e.target.value)}
                                                className="w-full md:w-2/3 p-3 bg-white rounded-lg border border-gray-200 text-sm font-bold uppercase tracking-widest text-gray-500 focus:ring-1 focus:ring-black outline-none shadow-sm"
                                                placeholder="PROVEEDOR"
                                            />
                                        </div>
                                        
                                        {/* Custom Catalog Field (Review Step) */}
                                        <div className="flex items-center">
                                            <input 
                                                type="text" 
                                                value={f.customCatalog || ''} 
                                                onChange={(e) => updateFabricField(i, 'customCatalog', e.target.value)}
                                                className="text-sm text-blue-800 bg-blue-50/50 px-3 py-2 rounded-lg border border-blue-100 focus:border-blue-400 focus:outline-none w-full md:w-2/3 placeholder-blue-300 font-medium"
                                                placeholder="Catálogo (yo lo escribo)"
                                            />
                                        </div>

                                        {/* Color Preview Swatches */}
                                        <div className="mt-2">
                                            <div className="flex items-center space-x-2 mb-2">
                                                <p className="text-[10px] text-gray-400 uppercase font-bold">
                                                    {f.colors?.length || 0} Colores Detectados
                                                </p>
                                                {/* Plus Button for Adding Color */}
                                                <button 
                                                    onClick={() => triggerUpload(i, 'add_color')}
                                                    className="w-5 h-5 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center border border-blue-100 hover:bg-blue-100 transition-colors shadow-sm"
                                                    title="Añadir color nuevo"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                                </button>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                {f.colors?.map((c, idx) => (
                                                    <div 
                                                        key={idx} 
                                                        onClick={() => triggerUpload(i, 'color', c)}
                                                        className="group relative w-8 h-8 rounded-full bg-gray-200 border-2 border-white shadow-sm overflow-hidden cursor-pointer hover:border-black transition-all" 
                                                        title={`${c} - Click para cambiar foto`}
                                                    >
                                                        {f.colorImages && f.colorImages[c] ? (
                                                            <img src={f.colorImages[c]} alt={c} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full bg-gray-300"></div>
                                                        )}
                                                        {/* Hover Edit Icon Overlay */}
                                                        <div className="absolute inset-0 bg-black/30 hidden group-hover:flex items-center justify-center">
                                                             <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        
                                        {/* Toggleable Specs Area */}
                                        {expandedSpecsIndex === i && (
                                            <div className="mt-2 animate-fade-in">
                                                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Resumen Técnico (Edición Rápida)</label>
                                                <textarea 
                                                    value={f.technicalSummary} 
                                                    onChange={(e) => updateFabricField(i, 'technicalSummary', e.target.value)}
                                                    className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:ring-1 focus:ring-black outline-none bg-white min-h-[80px]"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex flex-row md:flex-col items-start justify-start gap-2 pt-2">
                                         {/* Delete Button */}
                                         <button 
                                            onClick={() => removeFabricFromReview(i)}
                                            className="text-red-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors w-10 h-10 flex items-center justify-center"
                                            title="Eliminar"
                                         >
                                             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                         </button>
                                         
                                         {/* Notebook Button (Edit Specs) - Sized Same as Trash */}
                                         <button 
                                            onClick={() => setExpandedSpecsIndex(expandedSpecsIndex === i ? null : i)}
                                            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${expandedSpecsIndex === i ? 'bg-black text-white' : 'text-gray-400 hover:text-black hover:bg-gray-100'}`}
                                            title="Editar ficha técnica"
                                        >
                                             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                         </button>
                                    </div>
                                 </div>
                             </div>
                         ))}

                         {extractedFabrics.length === 0 && (
                             <div className="text-center py-10 text-gray-400">
                                 No quedan telas en la lista.
                             </div>
                         )}
                     </div>

                     <div className="pt-4 border-t border-gray-100 mt-2 flex gap-4">
                        <button 
                            onClick={() => { setStep('upload'); setFiles([]); }}
                            className="flex-1 bg-gray-100 text-gray-500 py-4 rounded-xl font-bold tracking-wide hover:bg-gray-200 transition-all uppercase text-sm"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleFinalSave}
                            disabled={extractedFabrics.length === 0}
                            className="flex-[2] bg-black text-white py-4 rounded-xl font-bold tracking-wide hover:opacity-80 transition-all uppercase text-sm shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Confirmar y Guardar ({extractedFabrics.length})
                        </button>
                     </div>
                     
                     {/* Hidden File Input for Image Replacement */}
                     <input 
                        ref={singleImageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleSingleImageChange}
                     />
                  </div>
                )}
            </>
        )}
      </div>
    </div>
  );
};

export default UploadModal;