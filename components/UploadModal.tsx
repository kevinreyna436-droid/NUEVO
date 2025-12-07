import React, { useState, useRef } from 'react';
import { extractFabricData } from '../services/geminiService';
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
  
  // Ref for directory upload
  const folderInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const uploadedFiles: File[] = Array.from(e.target.files);
      setFiles(uploadedFiles);
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
        } else if (imgFiles.length > 0) {
            // For images, we try to extract data from the first image which might be a cover or swatch card
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

      // 3. Cross-reference DB (Optional, keeps existing logic safe)
      let detectedColors: string[] = [];
      const dbName = Object.keys(MASTER_FABRIC_DB).find(
        key => key.toLowerCase() === rawData.name?.toLowerCase()
      );

      if (dbName) {
        detectedColors = MASTER_FABRIC_DB[dbName];
        rawData.name = dbName;
      } else {
        detectedColors = [];
      }

      // 4. Map Images
      const colorImages: Record<string, string> = {};
      
      for (const file of imgFiles) {
        try {
            const fileNameLower = file.name.toLowerCase().replace(/\.[^/.]+$/, "");
            
            // ORIGINAL QUALITY REQUESTED: 2048px width, 0.95 quality
            const base64Img = await compressImage(file, 2048, 0.95);

            if (dbName) {
                const matchedColor = detectedColors.find(color => fileNameLower.includes(color.toLowerCase()));
                if (matchedColor) {
                    colorImages[matchedColor] = base64Img;
                }
            } else {
                // Unknown fabric: Use filename as color (fallback if AI didn't catch it via prompt context)
                let cleanColorName = fileNameLower;
                
                if (rawData.name) {
                    const nameRegex = new RegExp(`^${rawData.name}[_\\-\\s]*`, 'i');
                    cleanColorName = cleanColorName.replace(nameRegex, '');
                }
                cleanColorName = cleanColorName.replace(/^(fromatex|fotmatex|formatex|creata)[_\-\s]*/i, '');
                
                const cleanName = cleanColorName.replace(/[-_]/g, " ").trim();
                // Ensure proper capitalization
                const formattedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);

                if (formattedName) {
                    colorImages[formattedName] = base64Img;
                    if (!detectedColors.includes(formattedName)) detectedColors.push(formattedName);
                }
            }
        } catch (imgError) {
            console.warn(`Failed to process image ${file.name}`, imgError);
        }
      }

      // Main Image Selection
      let mainImageToUse = '';
      if (Object.keys(colorImages).length > 0) {
          mainImageToUse = Object.values(colorImages)[0];
      } else if (imgFiles.length > 0) {
          try {
            // HIGH QUALITY HERE TOO
            mainImageToUse = await compressImage(imgFiles[0], 2048, 0.95);
          } catch(e) {
            mainImageToUse = '';
          }
      } else {
          mainImageToUse = ''; 
      }

      return {
          ...rawData,
          colors: detectedColors,
          colorImages: colorImages,
          mainImage: mainImageToUse,
          category: 'model'
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

  const handleFinalSave = async () => {
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
            category: 'model'
        }));

        if (finalFabrics.length === 1) {
            await onSave(finalFabrics[0]);
        } else if (finalFabrics.length > 1 && onBulkSave) {
            await onBulkSave(finalFabrics);
        } else {
            // Fallback loop
            for (const f of finalFabrics) {
                await onSave(f);
            }
        }

        // Only clear and close if successful
        setStep('upload');
        setFiles([]);
        setExtractedFabrics([]);
        onClose();
    } catch (error: any) {
        console.error("Save error:", error?.message || "Unknown error");
        alert("Ocurrió un error al guardar en la nube. Los archivos de alta calidad pueden estar saturando la conexión. Intenta subir menos telas a la vez.");
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-xl rounded-3xl p-8 shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]">
        {!isSaving && (
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-black">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        )}

        <h2 className="font-serif text-3xl mb-6 text-primary text-center flex-shrink-0">Subir Archivos</h2>

        {isSaving ? (
             <div className="flex flex-col items-center justify-center flex-1 h-64 space-y-6 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
                <div>
                    <p className="font-serif text-lg font-bold">Guardando Calidad Original...</p>
                    <p className="text-xs text-gray-400 mt-2">Esto puede tardar un poco debido al tamaño de las imágenes.</p>
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
                  <div className="flex flex-col space-y-6 text-center flex-1 overflow-hidden">
                     <div className="flex-1 overflow-y-auto">
                         <div className="bg-green-50 p-6 rounded-2xl mb-4">
                            <svg className="w-12 h-12 text-green-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            <h3 className="text-xl font-serif text-green-800">¡Análisis Completo!</h3>
                            <p className="text-sm text-green-600 mt-1">Se han procesado {extractedFabrics.length} telas.</p>
                         </div>
                         
                         <div className="space-y-2 text-left">
                             {extractedFabrics.map((f, i) => (
                                 <div key={i} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                                     <img src={f.mainImage} alt="" className="w-10 h-10 rounded object-cover bg-gray-200" />
                                     <div>
                                         <p className="font-bold text-sm text-gray-800">{f.name}</p>
                                         <p className="text-xs text-gray-400">{f.colors?.length || 0} colores detectados</p>
                                     </div>
                                 </div>
                             ))}
                         </div>
                     </div>

                     <button 
                      onClick={handleFinalSave}
                      className="w-full bg-black text-white py-4 rounded-xl font-bold tracking-wide hover:opacity-80 transition-all uppercase shadow-lg"
                    >
                      Guardar en Catálogo
                    </button>
                  </div>
                )}
            </>
        )}
      </div>
    </div>
  );
};

export default UploadModal;