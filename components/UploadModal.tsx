import React, { useState, useRef } from 'react';
import { extractFabricData } from '../services/geminiService';
import { MASTER_FABRIC_DB } from '../constants';
import { Fabric } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (fabric: Fabric) => void;
  onBulkSave?: (fabrics: Fabric[]) => void;
}

const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onSave, onBulkSave }) => {
  const [step, setStep] = useState<'upload' | 'processing' | 'review'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  // Store multiple extracted fabrics for bulk mode
  const [extractedFabrics, setExtractedFabrics] = useState<Partial<Fabric>[]>([]);
  const [currentProgress, setCurrentProgress] = useState<string>('');
  
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

      // 1. Extract Info from PDF or First Image
      try {
        if (pdfFile) {
            const base64Data = await fileToBase64(pdfFile);
            rawData = await extractFabricData(base64Data.split(',')[1], 'application/pdf');
        } else if (imgFiles.length > 0) {
            // Optional: Try extracting from first image
            // const base64Data = await fileToBase64(imgFiles[0]);
            // rawData = await extractFabricData(base64Data.split(',')[1], imgFiles[0].type);
        }
      } catch (e) {
          console.warn(`Extraction failed for ${groupName}`, e);
      }

      // HELPER: Remove "Fromatex", "Fotmatex" prefix if present
      const cleanFabricName = (inputName: string) => {
          if (!inputName) return "";
          // Remove "Fromatex" or "Fotmatex" followed by _, -, space or nothing, case insensitive
          return inputName.replace(/^(fromatex|fotmatex|formatex)[_\-\s]*/i, '').trim();
      };

      // Clean extracted name
      if (rawData.name && rawData.name !== "Unknown") {
          rawData.name = cleanFabricName(rawData.name);
      }

      // 2. Name Inference
      if (!rawData.name || rawData.name === "Unknown") {
          rawData.name = cleanFabricName(groupName); // Use cleaned folder name as fallback
      }

      // 3. Cross-reference DB
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
        const fileNameLower = file.name.toLowerCase().replace(/\.[^/.]+$/, "");
        const base64Img = await fileToBase64(file);

        if (dbName) {
            const matchedColor = detectedColors.find(color => fileNameLower.includes(color.toLowerCase()));
            if (matchedColor) {
                colorImages[matchedColor] = base64Img;
            }
        } else {
            // Unknown fabric: Use filename as color
            // Clean filename too if it has the fabric name prefix usually found in files (e.g. Fromatex_Alanis_Red.jpg)
            let cleanColorName = fileNameLower;
            
            // Try to remove fabric name prefix if it exists in filename
            if (rawData.name) {
                const nameRegex = new RegExp(`^${rawData.name}[_\\-\\s]*`, 'i');
                cleanColorName = cleanColorName.replace(nameRegex, '');
            }
            // Also clean Fromatex/Fotmatex if still there
            cleanColorName = cleanColorName.replace(/^(fromatex|fotmatex|formatex)[_\-\s]*/i, '');
            
            const cleanName = cleanColorName.replace(/[-_]/g, " ").trim();
            // Capitalize first letter
            const formattedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);

            colorImages[formattedName] = base64Img;
            if (!detectedColors.includes(formattedName)) detectedColors.push(formattedName);
        }
      }

      // Main Image
      let mainImageToUse = '';
      if (Object.keys(colorImages).length > 0) {
          mainImageToUse = Object.values(colorImages)[0];
      } else if (imgFiles.length > 0) {
          mainImageToUse = await fileToBase64(imgFiles[0]);
      } else {
          mainImageToUse = 'https://picsum.photos/800/600'; // Placeholder
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
      // Structure: UploadRoot/FabricA/file.jpg -> Key: FabricA
      // Structure: UploadRoot/file.jpg -> Key: root
      const groups: Record<string, File[]> = {};
      
      files.forEach(f => {
          const parts = f.webkitRelativePath.split('/');
          // parts[0] is the folder user selected. 
          // If user selected "Fabrics", and file is "Fabrics/Silk/red.jpg", parts = ['Fabrics', 'Silk', 'red.jpg']
          // Key should be 'Silk'.
          // If file is "Fabrics/list.pdf", parts = ['Fabrics', 'list.pdf']. Key 'root'.
          
          let key = 'root';
          if (parts.length > 2) {
              key = parts[1]; // The immediate subfolder inside the root
          } else if (parts.length === 2) {
              // File is directly inside the selected folder.
              // If we are doing bulk, maybe the selected folder IS the fabric? 
              // But usually bulk implies selecting a container folder.
              // We will treat 'root' as one group.
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

    } catch (err) {
      console.error(err);
      alert('Error procesando archivos. Intenta de nuevo.');
      setStep('upload');
    }
  };

  const handleFinalSave = () => {
    const finalFabrics: Fabric[] = extractedFabrics.map(data => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: data.name || 'Sin Nombre',
        supplier: data.supplier || 'Proveedor Desconocido',
        technicalSummary: data.technicalSummary || 'Sin datos técnicos disponibles.',
        specs: data.specs || { composition: 'N/A', martindale: 'N/A', usage: 'N/A' },
        colors: data.colors || [],
        colorImages: data.colorImages || {},
        mainImage: data.mainImage || '',
        category: 'model'
    }));

    if (finalFabrics.length === 1) {
        onSave(finalFabrics[0]);
    } else if (finalFabrics.length > 1 && onBulkSave) {
        onBulkSave(finalFabrics);
    } else {
        // Fallback loop
        finalFabrics.forEach(f => onSave(f));
    }

    setStep('upload');
    setFiles([]);
    setExtractedFabrics([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-xl rounded-3xl p-8 shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-black">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <h2 className="font-serif text-3xl mb-6 text-primary text-center flex-shrink-0">Subir Archivos</h2>

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
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center h-64 space-y-6 text-center flex-1">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
            <div>
                <p className="text-xl font-serif mb-2">Procesando...</p>
                <p className="text-sm text-gray-400">{currentProgress}</p>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4 flex-1 flex flex-col min-h-0">
             <div className="flex justify-between items-center mb-2">
                 <p className="text-sm text-gray-500">Se encontraron <span className="font-bold text-black">{extractedFabrics.length}</span> telas.</p>
             </div>
             
             {/* List of found fabrics */}
             <div className="flex-1 overflow-y-auto space-y-3 pr-2 border border-gray-100 rounded-xl p-2 bg-gray-50">
                 {extractedFabrics.map((fabric, idx) => (
                     <div key={idx} className="bg-white p-3 rounded-lg shadow-sm flex items-center space-x-3">
                         <div className="w-12 h-12 bg-gray-200 rounded-md overflow-hidden flex-shrink-0">
                             {fabric.mainImage && <img src={fabric.mainImage} className="w-full h-full object-cover" alt="" />}
                         </div>
                         <div className="flex-1 min-w-0">
                             <h4 className="font-bold text-sm truncate">{fabric.name}</h4>
                             <p className="text-xs text-gray-400 truncate">{fabric.supplier} • {fabric.colors?.length} colores</p>
                         </div>
                     </div>
                 ))}
             </div>

            <button 
              onClick={handleFinalSave}
              className="w-full bg-primary text-white py-4 rounded-xl font-bold tracking-wide hover:bg-black transition-all uppercase flex-shrink-0 mt-4"
            >
              Guardar Todo ({extractedFabrics.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadModal;