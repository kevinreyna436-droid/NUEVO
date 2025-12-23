import React, { useState, useRef } from 'react';
import { extractFabricData } from '../services/geminiService';
import { Fabric, FurnitureTemplate } from '../types';
import { compressImage } from '../utils/imageCompression';
import { diagnoseConnection } from '../services/firebase';

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
  onClearDatabase?: () => Promise<void> | void;
}

const UploadModal: React.FC<UploadModalProps> = ({ 
    isOpen, onClose, onSave, onBulkSave, onReset, existingFabrics = [],
    existingFurniture = [], onSaveFurniture, onDeleteFurniture, onClearDatabase
}) => {
  const [activeTab, setActiveTab] = useState<'fabrics' | 'furniture' | 'matcher'>('matcher');
  const [step, setStep] = useState<'upload' | 'processing' | 'review'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [extractedFabrics, setExtractedFabrics] = useState<Partial<Fabric>[]>([]);
  const [currentProgress, setCurrentProgress] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Matcher state
  const [matchFiles, setMatchFiles] = useState<File[]>([]);
  const matcherInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Furniture form state
  const [furnData, setFurnData] = useState<Partial<FurnitureTemplate>>({ name: '', category: 'sofa', imageUrl: '' });

  if (!isOpen) return null;

  const toSentenceCase = (str: string) => str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';

  const handleCheckConnection = async () => {
      const status = await diagnoseConnection();
      alert(status);
  };

  /**
   * Carga individual de Fichas para IA
   */
  const handleFabricUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    const selectedFiles: File[] = Array.from(fileList);
    if (selectedFiles.length === 0) return;
    
    setFiles(selectedFiles);
    setStep('processing');
    const results: Partial<Fabric>[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setCurrentProgress(`Analizando ficha ${i + 1} de ${selectedFiles.length}: ${file.name}...`);
      
      try {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        const mimeType = file.type;
        const data = await extractFabricData(base64.split(',')[1], mimeType);
        
        results.push({
          ...data,
          id: `fab-${Date.now()}-${i}`,
          category: 'model',
          mainImage: mimeType.startsWith('image/') ? base64 : '',
          colors: data.colors || [],
          colorImages: {}
        });
      } catch (err) {
        console.error("Error procesando archivo:", file.name, err);
      }
    }

    setExtractedFabrics(results);
    setStep('review');
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    setCurrentProgress('Guardando en la nube...');
    try {
      if (onBulkSave) {
        await onBulkSave(extractedFabrics as Fabric[]);
      } else {
        for (const f of extractedFabrics) {
          await onSave(f as Fabric);
        }
      }
      onClose();
      if (onReset) onReset();
    } catch (e) {
      alert("Error al guardar.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFurnitureSave = async () => {
      if (!furnData.name || !furnData.imageUrl) return;
      setIsSaving(true);
      try {
          if (onSaveFurniture) {
              await onSaveFurniture({
                  ...furnData,
                  id: `furn-${Date.now()}`
              } as FurnitureTemplate);
              setFurnData({ name: '', category: 'sofa', imageUrl: '' });
              alert("Mueble guardado correctamente.");
          }
      } catch(e) {
          alert("Error guardando mueble.");
      } finally {
          setIsSaving(false);
      }
  };

  /**
   * MATCHER 1: Archivos Sueltos (Flat)
   */
  const handleMatchImages = async () => {
      if (matchFiles.length === 0) return;
      setIsSaving(true);
      let matchCount = 0;
      for (const file of matchFiles) {
          const fileName = file.name.split('.')[0].toLowerCase().trim();
          const targetFabric = existingFabrics.find(f => f.name.toLowerCase().trim() === fileName);
          if (targetFabric) {
              try {
                  const base64 = await compressImage(file, 2048, 0.9);
                  await onSave({ ...targetFabric, mainImage: base64 });
                  matchCount++;
              } catch (e) { console.error(e); }
          }
      }
      setIsSaving(false);
      alert(`Sincronización terminada. Se actualizaron ${matchCount} fotos.`);
      onClose();
  };

  /**
   * MATCHER 2: CARGA DE CARPETAS (Deep Folder Structure)
   */
  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setIsSaving(true);
    setCurrentProgress("Analizando estructura de carpetas...");

    const files = Array.from(fileList) as any[];
    const groups: Record<string, { main?: File, pdf?: File, colors: File[] }> = {};
    let fabricsProcessed = 0;
    let newFabricsCreated = 0;

    // 1. Agrupar archivos por carpeta padre (Nombre de la Tela)
    for (const file of files) {
        // webkitRelativePath ej: "Coleccion2024/Alanis/header.jpg"
        const pathParts = (file.webkitRelativePath || "").split('/');
        if (pathParts.length < 2) continue; // Ignorar archivos en la raiz sin carpeta

        // El nombre de la tela es el nombre de su carpeta contenedora
        // Si la estructura es Root/Alanis/foto.jpg -> "Alanis" es parts[length-2]
        const fabricName = pathParts[pathParts.length - 2]; 
        const fileName = file.name.toLowerCase();

        if (!groups[fabricName]) {
            groups[fabricName] = { colors: [] };
        }

        if (fileName.endsWith('.pdf')) {
            groups[fabricName].pdf = file;
        } else if (file.type.startsWith('image/')) {
            // Heurística: Si la imagen se llama igual que la carpeta, o 'main', 'header', 'portada' -> Principal
            const nameNoExt = fileName.split('.')[0];
            if (nameNoExt === fabricName.toLowerCase() || nameNoExt === 'main' || nameNoExt === 'portada' || nameNoExt === 'header') {
                groups[fabricName].main = file;
            } else {
                groups[fabricName].colors.push(file);
            }
        }
    }

    // 2. Procesar cada grupo
    const fabricNames = Object.keys(groups);
    for (let i = 0; i < fabricNames.length; i++) {
        const name = fabricNames[i];
        const group = groups[name];
        
        setCurrentProgress(`Procesando carpeta (${i+1}/${fabricNames.length}): ${name}...`);

        // Buscar si existe la tela
        let targetFabric = existingFabrics.find(f => f.name.toLowerCase().trim() === name.toLowerCase().trim());
        let isNew = false;

        // Si no existe, crearla
        if (!targetFabric) {
            targetFabric = {
                id: `bulk-${Date.now()}-${i}`,
                name: toSentenceCase(name),
                supplier: 'CARGA MASIVA',
                technicalSummary: 'Importado automáticamente desde carpeta.',
                specs: { composition: '', martindale: '', usage: '' },
                colors: [],
                colorImages: {},
                mainImage: '',
                category: 'model'
            };
            isNew = true;
            newFabricsCreated++;
        }

        // Actualizar datos
        const updatedFabric = { ...targetFabric };

        // A) Procesar PDF (Ficha técnica)
        if (group.pdf) {
            const reader = new FileReader();
            const pdfBase64 = await new Promise<string>((resolve) => {
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(group.pdf!);
            });
            updatedFabric.pdfUrl = pdfBase64;
            updatedFabric.technicalSummary += " (Ficha técnica PDF adjunta)";
        }

        // B) Procesar Imagen Principal
        if (group.main) {
            try {
                updatedFabric.mainImage = await compressImage(group.main, 2048, 0.9);
            } catch(e) {}
        } else if (group.colors.length > 0 && !updatedFabric.mainImage) {
            // Si no hay main explicita, usar la primera de color
            try {
                updatedFabric.mainImage = await compressImage(group.colors[0], 2048, 0.9);
            } catch(e) {}
        }

        // C) Procesar Colores
        // Solo si hay imágenes de color, actualizamos la lista
        if (group.colors.length > 0) {
            const newColorImages = { ...(updatedFabric.colorImages || {}) };
            const newColorsList = new Set(updatedFabric.colors || []);

            for (const colorFile of group.colors) {
                try {
                    // Nombre del archivo = Nombre del color (ej: "Azul Marino.jpg")
                    const colorName = toSentenceCase(colorFile.name.split('.')[0].replace(/[-_]/g, ' '));
                    const b64 = await compressImage(colorFile, 2048, 0.9);
                    
                    newColorImages[colorName] = b64;
                    newColorsList.add(colorName);
                } catch(e) {}
            }
            updatedFabric.colorImages = newColorImages;
            updatedFabric.colors = Array.from(newColorsList).sort();
        }

        await onSave(updatedFabric);
        fabricsProcessed++;
    }

    setIsSaving(false);
    alert(`¡Proceso completado!\n\n📁 Carpetas procesadas: ${fabricsProcessed}\n✨ Telas nuevas creadas: ${newFabricsCreated}\n\nLas fotos y PDFs han sido vinculados.`);
    if (onReset) onReset();
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
                <button onClick={() => {setActiveTab('fabrics'); setStep('upload');}} className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase transition-all ${activeTab === 'fabrics' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}>Telas (IA)</button>
                <button onClick={() => setActiveTab('matcher')} className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase transition-all ${activeTab === 'matcher' ? 'bg-blue-600 shadow-sm text-white' : 'text-gray-500'}`}>Carga Masiva</button>
                <button onClick={() => setActiveTab('furniture')} className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase transition-all ${activeTab === 'furniture' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}>Muebles</button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
            {isSaving || step === 'processing' ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                    <p className="font-bold text-lg text-slate-800">{currentProgress}</p>
                    <p className="text-xs text-gray-400 mt-2">No cierres esta ventana. Estamos subiendo tus archivos a la nube.</p>
                </div>
            ) : activeTab === 'fabrics' && step === 'upload' ? (
                <div className="max-w-xl mx-auto text-center space-y-6 py-10">
                    <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <h2 className="font-serif text-3xl font-bold">Escaneo por IA</h2>
                    <p className="text-gray-500 text-sm">Sube fichas técnicas (JPG o PDF) individuales. Gemini extraerá los datos y creará la tela.</p>
                    <label className="block w-full bg-black text-white py-4 rounded-xl font-bold uppercase tracking-widest text-sm shadow-xl hover:scale-105 transition-transform cursor-pointer">
                        Seleccionar Fichas Sueltas
                        <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={handleFabricUpload} />
                    </label>
                </div>
            ) : activeTab === 'fabrics' && step === 'review' ? (
                <div className="space-y-6">
                    <h3 className="font-serif text-2xl font-bold border-b pb-4">Revisar Datos Extraídos ({extractedFabrics.length})</h3>
                    {extractedFabrics.map((fabric, idx) => (
                        <div key={idx} className="bg-gray-50 p-6 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-6 border border-gray-100">
                            <div className="md:col-span-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Nombre</label>
                                <input type="text" value={fabric.name} onChange={(e) => {
                                    const next = [...extractedFabrics];
                                    next[idx].name = e.target.value;
                                    setExtractedFabrics(next);
                                }} className="w-full bg-white border border-gray-200 p-2 rounded mt-1 font-bold" />
                            </div>
                            <div className="md:col-span-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Proveedor</label>
                                <input type="text" value={fabric.supplier} onChange={(e) => {
                                    const next = [...extractedFabrics];
                                    next[idx].supplier = e.target.value;
                                    setExtractedFabrics(next);
                                }} className="w-full bg-white border border-gray-200 p-2 rounded mt-1 uppercase" />
                            </div>
                            <div className="md:col-span-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Martindale</label>
                                <input type="text" value={fabric.specs?.martindale} onChange={(e) => {
                                    const next = [...extractedFabrics];
                                    if(next[idx].specs) next[idx].specs!.martindale = e.target.value;
                                    setExtractedFabrics(next);
                                }} className="w-full bg-white border border-gray-200 p-2 rounded mt-1" />
                            </div>
                        </div>
                    ))}
                    <button onClick={handleSaveAll} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold uppercase tracking-widest shadow-xl">Guardar Todo en la Nube</button>
                </div>
            ) : activeTab === 'matcher' ? (
                <div className="max-w-xl mx-auto text-center space-y-10 py-6">
                    <div>
                        <h2 className="font-serif text-3xl font-bold mb-3">Carga Masiva Inteligente</h2>
                        <p className="text-gray-500 text-sm">Elige el método que mejor se adapte a tus archivos.</p>
                    </div>

                    {/* OPCIÓN 1: CARPETA MAESTRA */}
                    <div className="bg-blue-50 border border-blue-100 rounded-3xl p-8 relative overflow-hidden group hover:border-blue-300 transition-colors">
                        <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-widest">Recomendado</div>
                        <div className="flex items-center gap-6 mb-4">
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm text-blue-600">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-lg text-slate-900">Carpeta Maestra</h3>
                                <p className="text-xs text-gray-500 leading-snug">Selecciona una carpeta que contenga subcarpetas por tela (ej: Colección 2024/{'{'}Alanis, Boon...{'}'}).</p>
                            </div>
                        </div>
                        <ul className="text-left text-xs text-gray-500 list-disc list-inside mb-6 space-y-1 pl-2">
                             <li>Detecta automáticamente el nombre de la tela por la carpeta.</li>
                             <li>Importa PDFs como fichas técnicas.</li>
                             <li>Clasifica fotos como "Principal" o "Colores" automáticamente.</li>
                        </ul>
                        <button 
                            onClick={() => folderInputRef.current?.click()}
                            className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-colors"
                        >
                            Seleccionar Carpeta Completa
                        </button>
                        {/* Input especial para directorios */}
                        <input 
                            ref={folderInputRef} 
                            type="file" 
                            {...({ webkitdirectory: "", directory: "" } as any)}
                            className="hidden" 
                            onChange={handleFolderUpload} 
                        />
                    </div>

                    <div className="relative flex items-center py-2">
                        <div className="flex-grow border-t border-gray-200"></div>
                        <span className="flex-shrink-0 mx-4 text-gray-400 text-xs font-bold uppercase">O bien</span>
                        <div className="flex-grow border-t border-gray-200"></div>
                    </div>

                    {/* OPCIÓN 2: ARCHIVOS SUELTOS */}
                    <div className="border-2 border-dashed border-gray-200 rounded-3xl p-8 hover:bg-gray-50 transition-colors">
                        <h3 className="font-bold text-base text-gray-700 mb-2">Archivos Sueltos (Reparación)</h3>
                        <p className="text-xs text-gray-400 mb-4">Sube fotos sueltas (ej: "Alanis.jpg") para que se vinculen a telas ya creadas.</p>
                        
                        <div 
                            onClick={() => matcherInputRef.current?.click()}
                            className="cursor-pointer py-4 bg-white border border-gray-200 rounded-xl hover:border-gray-400 transition-all"
                        >
                            <span className="text-xs font-bold uppercase text-gray-500">Seleccionar Fotos Sueltas</span>
                        </div>
                        <input ref={matcherInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => setMatchFiles(Array.from(e.target.files || []))} />
                        
                        {matchFiles.length > 0 && (
                            <button onClick={handleMatchImages} className="mt-4 w-full bg-slate-800 text-white py-3 rounded-xl font-bold uppercase text-xs">
                                Vincular {matchFiles.length} Fotos
                            </button>
                        )}
                    </div>
                    
                    {/* BUTTONS ZONA DE GESTIÓN */}
                    <div className="pt-8 mt-8 border-t border-gray-100 flex flex-col items-center gap-4">
                        <button 
                            onClick={handleCheckConnection}
                            className="text-gray-500 hover:text-black border border-gray-300 hover:border-black px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-widest transition-all flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" /></svg>
                            Verificar Conexión
                        </button>

                        {onClearDatabase && (
                            <div className="flex flex-col items-center">
                                <button 
                                    onClick={onClearDatabase}
                                    className="text-red-500 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 px-8 py-3 rounded-xl font-bold uppercase text-xs tracking-widest transition-all"
                                >
                                    BORRAR TODO
                                </button>
                                <p className="text-[10px] text-red-300 mt-2">Eliminará todas las telas del sistema</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="max-w-xl mx-auto space-y-6 py-10">
                    <h2 className="font-serif text-3xl font-bold text-center">Nuevo Mueble</h2>
                    <div className="space-y-4">
                        <input type="text" placeholder="Nombre del Mueble" value={furnData.name} onChange={(e)=>setFurnData({...furnData, name: e.target.value})} className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200" />
                        <select value={furnData.category} onChange={(e)=>setFurnData({...furnData, category: e.target.value})} className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <option value="sofa">Sofá</option>
                            <option value="chair">Silla</option>
                            <option value="armchair">Butaca</option>
                        </select>
                        <input type="file" accept="image/*" onChange={async (e) => {
                            if(e.target.files?.[0]) {
                                const b64 = await compressImage(e.target.files[0], 2048, 0.9);
                                setFurnData({...furnData, imageUrl: b64});
                            }
                        }} className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200" />
                        <button onClick={handleFurnitureSave} className="w-full bg-black text-white py-4 rounded-xl font-bold uppercase tracking-widest">Añadir Mueble</button>
                    </div>
                    
                    <div className="mt-10 pt-10 border-t">
                        <h4 className="text-[10px] font-bold uppercase text-gray-400 mb-4">Gestionar Existentes</h4>
                        <div className="grid grid-cols-3 gap-4">
                            {existingFurniture.map(f => (
                                <div key={f.id} className="relative group">
                                    <img src={f.imageUrl} className="w-full h-24 object-contain bg-gray-100 rounded-xl" />
                                    <button onClick={()=>onDeleteFurniture?.(f.id)} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default UploadModal;