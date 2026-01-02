
import React, { useState, useRef, useEffect } from 'react';
import { Fabric, FurnitureTemplate } from '../types';
import { compressImage } from '../utils/imageCompression';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (fabric: Fabric) => Promise<void>;
  onBulkSave: (fabrics: Fabric[]) => Promise<void>;
  onReset: () => void;
  existingFabrics: Fabric[];
  existingFurniture: FurnitureTemplate[];
  onSaveFurniture?: (template: FurnitureTemplate) => Promise<void>;
  onDeleteFurniture?: (id: string) => Promise<void>;
}

// Helper interface for Bulk Items
interface BulkItem {
    tempId: string;
    name: string;
    supplier: string;
    image: string; // Base64
    originalFile: File;
}

const UploadModal: React.FC<UploadModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  onBulkSave,
  onReset,
  onSaveFurniture
}) => {
  // Tabs: 'fabric' | 'rug' | 'wood' | 'furniture' | 'scene'
  const [activeTab, setActiveTab] = useState<'fabric' | 'rug' | 'wood' | 'furniture' | 'scene'>('fabric');
  const [isSaving, setIsSaving] = useState(false);
  
  // MODE: Single vs Bulk
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  // --- FABRIC STATE (Single) ---
  const [fabName, setFabName] = useState('');
  const [fabSupplier, setFabSupplier] = useState('');
  const [fabImage, setFabImage] = useState<string | null>(null);
  const fabInputRef = useRef<HTMLInputElement>(null);

  // --- RUG STATE (Single) ---
  const [rugName, setRugName] = useState('');
  const [rugSupplier, setRugSupplier] = useState('');
  const [rugImage, setRugImage] = useState<string | null>(null);
  const rugInputRef = useRef<HTMLInputElement>(null);

  // --- WOOD STATE ---
  const [woodName, setWoodName] = useState('');
  const [woodSupplier, setWoodSupplier] = useState('');
  const [woodImage, setWoodImage] = useState<string | null>(null);
  const woodInputRef = useRef<HTMLInputElement>(null);

  // --- FURNITURE STATE (MUEBLES) ---
  const [furnName, setFurnName] = useState('');
  const [furnCategory, setFurnCategory] = useState('');
  const [furnSupplier, setFurnSupplier] = useState('');
  const [furnImage, setFurnImage] = useState<string | null>(null);
  const furnInputRef = useRef<HTMLInputElement>(null);

  // --- SCENE STATE (ESCENAS) ---
  const [sceneName, setSceneName] = useState('');
  const [sceneImage, setSceneImage] = useState<string | null>(null);
  const sceneInputRef = useRef<HTMLInputElement>(null);

  // Reset states when tab changes
  useEffect(() => {
      setBulkItems([]);
      setIsBulkMode(false);
  }, [activeTab]);

  if (!isOpen) return null;

  const toSentenceCase = (str: string) => {
    if (!str) return '';
    // Eliminar extensiones de archivo si vienen en el string
    const clean = str.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
    return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
  };

  // --- BULK HANDLERS ---
  
  const handleBulkFilesSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const newItems: BulkItem[] = [];
          // Fix: Explicitly cast to File[] to avoid unknown type inference
          const files = Array.from(e.target.files) as File[];
          
          // Limit to 50 at a time to prevent browser crash
          const filesToProcess = files.slice(0, 50);

          for (const file of filesToProcess) {
             try {
                 const base64 = await compressImage(file, 1024, 0.85); // Slightly lower quality for bulk speed
                 newItems.push({
                     tempId: Math.random().toString(36).substr(2, 9),
                     name: toSentenceCase(file.name), // Smart name inference from filename
                     supplier: activeTab === 'rug' ? 'CREATA RUGS' : '',
                     image: base64,
                     originalFile: file
                 });
             } catch (err) {
                 console.error("Error processing file", file.name, err);
             }
          }
          
          setBulkItems(prev => [...prev, ...newItems]);
          // Clear input to allow re-selecting same files if needed
          if (bulkInputRef.current) bulkInputRef.current.value = '';
      }
  };

  const updateBulkItem = (id: string, field: 'name' | 'supplier', value: string) => {
      setBulkItems(prev => prev.map(item => 
          item.tempId === id ? { ...item, [field]: value } : item
      ));
  };

  const removeBulkItem = (id: string) => {
      setBulkItems(prev => prev.filter(item => item.tempId !== id));
  };

  const saveAllBulkItems = async () => {
      if (bulkItems.length === 0) return;
      setIsSaving(true);
      try {
          const finalFabrics: Fabric[] = bulkItems.map(item => {
               const category = activeTab === 'rug' ? 'rug' : 'model';
               const customCatalog = activeTab === 'rug' ? 'Colección Tapetes' : 'Carga Masiva';
               const techSummary = activeTab === 'rug' ? 'Alfombra decorativa' : 'Tejido para tapicería';

               return {
                  id: `${category}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                  name: toSentenceCase(item.name),
                  supplier: item.supplier ? item.supplier.toUpperCase() : 'GENÉRICO',
                  technicalSummary: techSummary,
                  specs: { composition: '', martindale: '', usage: '' },
                  colors: [toSentenceCase(item.name)], // In bulk, usually main image = color name
                  colorImages: {},
                  mainImage: item.image,
                  category: category as any,
                  customCatalog: customCatalog
               };
          });

          await onBulkSave(finalFabrics);
          setBulkItems([]);
          alert(`${finalFabrics.length} elementos guardados correctamente.`);
          onClose(); // Close modal on success for UX
      } catch (e: any) {
          alert("Error en carga masiva: " + e.message);
      } finally {
          setIsSaving(false);
      }
  };


  // --- SINGLE HANDLERS ---

  // 1. FABRIC
  const handleFabImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) {
          try {
              const base64 = await compressImage(e.target.files[0], 2048, 0.9);
              setFabImage(base64);
              // Auto-fill name from filename if empty
              if (!fabName) {
                  setFabName(toSentenceCase(e.target.files[0].name));
              }
          } catch(err) {
              alert("Error al procesar imagen");
          }
      }
  };

  const handleSaveFabric = async () => {
      if (!fabName || !fabImage) return;
      setIsSaving(true);
      try {
          const newFabric: Fabric = {
              id: `model-${Date.now()}`,
              name: toSentenceCase(fabName),
              supplier: fabSupplier ? fabSupplier.toUpperCase() : 'GENÉRICO',
              technicalSummary: 'Tejido para tapicería',
              specs: { composition: 'Poliester/Algodón', martindale: '', usage: 'Tapicería' },
              colors: [toSentenceCase(fabName)],
              colorImages: {}, 
              mainImage: fabImage,
              category: 'model',
              customCatalog: 'Colección Telas'
          };
          
          await onSave(newFabric); 
          setFabName('');
          setFabSupplier('');
          setFabImage(null);
          alert("Tela guardada correctamente.");
      } catch (e: any) {
          alert("Error guardando tela: " + e.message);
      } finally {
          setIsSaving(false);
      }
  };

  // 2. RUG
  const handleRugImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) {
          try {
              const base64 = await compressImage(e.target.files[0], 2048, 0.9);
              setRugImage(base64);
              if (!rugName) {
                  setRugName(toSentenceCase(e.target.files[0].name));
              }
          } catch(err) {
              alert("Error al procesar imagen");
          }
      }
  };

  const handleSaveRug = async () => {
      if (!rugName || !rugImage) return;
      setIsSaving(true);
      try {
          const newRug: Fabric = {
              id: `rug-${Date.now()}`,
              name: toSentenceCase(rugName),
              supplier: rugSupplier ? rugSupplier.toUpperCase() : 'GENÉRICO',
              technicalSummary: 'Alfombra / Tapete decorativo',
              specs: { composition: 'Fibras Varias', martindale: '', usage: 'Piso' },
              colors: [toSentenceCase(rugName)],
              colorImages: {}, 
              mainImage: rugImage,
              category: 'rug',
              customCatalog: 'Colección Tapetes'
          };
          
          await onSave(newRug); 
          setRugName('');
          setRugSupplier('');
          setRugImage(null);
          alert("Tapete guardado correctamente.");
      } catch (e: any) {
          alert("Error guardando tapete: " + e.message);
      } finally {
          setIsSaving(false);
      }
  };

  // 3. WOOD
  const handleWoodImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) {
          try {
              const base64 = await compressImage(e.target.files[0], 2048, 0.9);
              setWoodImage(base64);
          } catch(err) {
              alert("Error al procesar imagen");
          }
      }
  };

  const handleSaveWoodInternal = async () => {
      if (!woodName || !woodImage) return;
      setIsSaving(true);
      try {
          const newWood: Fabric = {
              id: `wood-${Date.now()}`,
              name: toSentenceCase(woodName),
              supplier: woodSupplier ? woodSupplier.toUpperCase() : 'GENÉRICO',
              technicalSummary: 'Acabado de madera',
              specs: { composition: 'Madera', martindale: '', usage: 'Estructura' },
              colors: [toSentenceCase(woodName)],
              colorImages: {}, 
              mainImage: woodImage,
              category: 'wood',
              customCatalog: 'Maderas'
          };
          
          await onSave(newWood); 
          setWoodName('');
          setWoodSupplier('');
          setWoodImage(null);
          alert("Madera guardada correctamente.");
      } catch (e: any) {
          alert("Error guardando madera: " + e.message);
      } finally {
          setIsSaving(false);
      }
  };

  // 4. FURNITURE (MUEBLES)
  const handleFurnImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) {
          try {
              const base64 = await compressImage(e.target.files[0], 2048, 0.9);
              setFurnImage(base64);
          } catch(err) {
              alert("Error al procesar imagen");
          }
      }
  };

  const handleSaveFurnitureInternal = async () => {
      if (!furnName || !furnImage || !onSaveFurniture) return;
      setIsSaving(true);
      try {
          const template: FurnitureTemplate = {
              id: `furn-${Date.now()}`,
              name: toSentenceCase(furnName),
              category: furnCategory.toLowerCase() || 'sofa',
              imageUrl: furnImage,
              supplier: furnSupplier ? furnSupplier.toUpperCase() : '',
              catalog: 'Carga Manual'
          };
          
          await onSaveFurniture(template);
          setFurnName('');
          setFurnCategory('');
          setFurnSupplier('');
          setFurnImage(null);
          alert("Mueble guardado correctamente.");
      } catch (e: any) { 
          alert("Error al guardar el mueble: " + e.message);
      } finally {
          setIsSaving(false);
      }
  };

  // 5. SCENE (ESCENAS)
  const handleSceneImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) {
          try {
              const base64 = await compressImage(e.target.files[0], 2048, 0.9);
              setSceneImage(base64);
              if (!sceneName) {
                  setSceneName(toSentenceCase(e.target.files[0].name));
              }
          } catch(err) {
              alert("Error al procesar imagen de la escena");
          }
      }
  };

  const handleSaveScene = async () => {
      if (!sceneName || !sceneImage || !onSaveFurniture) return;
      setIsSaving(true);
      try {
          const template: FurnitureTemplate = {
              id: `scene-${Date.now()}`,
              name: toSentenceCase(sceneName),
              category: 'rug', // Se clasifica como 'rug' para aparecer en la sección de tapetes/escenas
              imageUrl: sceneImage,
              supplier: 'ESCENA',
              catalog: 'Carga Manual'
          };
          
          await onSaveFurniture(template);
          setSceneName('');
          setSceneImage(null);
          alert("Escena guardada correctamente.");
      } catch (e: any) { 
          alert("Error al guardar la escena: " + e.message);
      } finally {
          setIsSaving(false);
      }
  };

  // --- UI COMPONENTS FOR BULK ---
  const BulkUploadView = () => (
      <div className="flex flex-col h-full">
          {bulkItems.length === 0 ? (
              <div 
                  onClick={() => bulkInputRef.current?.click()}
                  className="flex-1 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors m-4"
              >
                  <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  <h3 className="text-lg font-bold text-gray-400 uppercase tracking-widest">Seleccionar Archivos</h3>
                  <p className="text-xs text-gray-300 mt-2">Puedes seleccionar múltiples imágenes a la vez.</p>
              </div>
          ) : (
              <div className="flex-1 overflow-y-auto p-4">
                  <div className="flex justify-between items-center mb-4 px-2">
                      <span className="text-xs font-bold uppercase text-gray-400">{bulkItems.length} Elementos listos</span>
                      <button onClick={() => bulkInputRef.current?.click()} className="text-blue-600 text-xs font-bold hover:underline">+ Agregar más</button>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {bulkItems.map((item) => (
                          <div key={item.tempId} className="flex gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                              <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                  <img src={item.image} className="w-full h-full object-cover" />
                              </div>
                              <div className="flex-1 flex flex-col gap-2">
                                  <input 
                                      value={item.name}
                                      onChange={(e) => updateBulkItem(item.tempId, 'name', e.target.value)}
                                      className="w-full p-2 text-xs font-bold border-b border-gray-200 focus:border-black outline-none"
                                      placeholder="Nombre"
                                  />
                                  <input 
                                      value={item.supplier}
                                      onChange={(e) => updateBulkItem(item.tempId, 'supplier', e.target.value)}
                                      className="w-full p-2 text-[10px] uppercase text-gray-500 border-b border-gray-200 focus:border-black outline-none"
                                      placeholder="PROVEEDOR"
                                  />
                              </div>
                              <button onClick={() => removeBulkItem(item.tempId)} className="text-red-400 hover:text-red-600 self-start">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                          </div>
                      ))}
                  </div>
              </div>
          )}
          
          <input ref={bulkInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleBulkFilesSelect} />
          
          <div className="p-4 border-t border-gray-100 bg-white">
              <button 
                  onClick={saveAllBulkItems}
                  disabled={bulkItems.length === 0 || isSaving}
                  className="w-full bg-black text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-xl disabled:opacity-50"
              >
                  {isSaving ? `Subiendo ${bulkItems.length} Elementos...` : `Guardar Todo (${bulkItems.length})`}
              </button>
          </div>
      </div>
  );

  const ModeToggle = () => (
      <div className="flex justify-center mb-6 px-8">
          <div className="bg-gray-100 p-1 rounded-full flex w-full max-w-xs relative">
              <div 
                  className={`absolute top-1 bottom-1 w-[48%] bg-white rounded-full shadow-sm transition-all duration-300 ${isBulkMode ? 'left-[50%]' : 'left-[2%]'}`}
              ></div>
              <button 
                  onClick={() => setIsBulkMode(false)}
                  className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest z-10 transition-colors ${!isBulkMode ? 'text-black' : 'text-gray-400'}`}
              >
                  Individual
              </button>
              <button 
                  onClick={() => setIsBulkMode(true)}
                  className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest z-10 transition-colors ${isBulkMode ? 'text-black' : 'text-gray-400'}`}
              >
                  Masivo
              </button>
          </div>
      </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
       <div className="bg-white w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
             <div>
                 <h2 className="font-serif text-2xl font-bold text-slate-900">Centro de Carga</h2>
                 <p className="text-xs text-gray-400 mt-1">Sube telas, tapetes, maderas, muebles o escenas.</p>
             </div>
             <button onClick={onClose} className="text-gray-400 hover:text-black">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
             </button>
          </div>

          {/* Tabs - 5 PESTAÑAS */}
          <div className="flex border-b border-gray-100 overflow-x-auto">
             <button 
                onClick={() => setActiveTab('fabric')}
                className={`flex-1 py-4 px-2 text-xs font-bold uppercase tracking-widest min-w-[80px] ${activeTab === 'fabric' ? 'bg-white text-black border-b-2 border-black' : 'bg-gray-50 text-gray-400'}`}
             >
                Telas
             </button>
             <button 
                onClick={() => setActiveTab('rug')}
                className={`flex-1 py-4 px-2 text-xs font-bold uppercase tracking-widest min-w-[80px] ${activeTab === 'rug' ? 'bg-white text-black border-b-2 border-black' : 'bg-gray-50 text-gray-400'}`}
             >
                Tapetes
             </button>
             <button 
                onClick={() => setActiveTab('wood')}
                className={`flex-1 py-4 px-2 text-xs font-bold uppercase tracking-widest min-w-[80px] ${activeTab === 'wood' ? 'bg-white text-black border-b-2 border-black' : 'bg-gray-50 text-gray-400'}`}
             >
                Maderas
             </button>
             <button 
                onClick={() => setActiveTab('furniture')}
                className={`flex-1 py-4 px-2 text-xs font-bold uppercase tracking-widest min-w-[80px] ${activeTab === 'furniture' ? 'bg-white text-black border-b-2 border-black' : 'bg-gray-50 text-gray-400'}`}
             >
                Muebles
             </button>
             <button 
                onClick={() => setActiveTab('scene')}
                className={`flex-1 py-4 px-2 text-xs font-bold uppercase tracking-widest min-w-[80px] ${activeTab === 'scene' ? 'bg-white text-black border-b-2 border-black' : 'bg-gray-50 text-gray-400'}`}
             >
                Escenas
             </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-gray-50/50 relative">
             
             {/* 1. TAB: FABRICS */}
             {activeTab === 'fabric' && (
                 <div className="h-full flex flex-col pt-6">
                     <ModeToggle />
                     
                     {isBulkMode ? (
                         <BulkUploadView />
                     ) : (
                         <div className="max-w-lg mx-auto w-full space-y-6 px-8 pb-8">
                             <div 
                                onClick={() => fabInputRef.current?.click()}
                                className="w-full aspect-square bg-white rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-black transition-colors relative overflow-hidden group"
                             >
                                {fabImage ? (
                                    <img src={fabImage} className="w-full h-full object-cover" />
                                ) : (
                                    <>
                                        <svg className="w-10 h-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        <span className="text-xs font-bold text-gray-400 uppercase">Foto de la Tela</span>
                                    </>
                                )}
                                <input ref={fabInputRef} type="file" className="hidden" accept="image/*" onChange={handleFabImageChange} />
                             </div>
                             
                             <div>
                                <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Nombre del Modelo</label>
                                <input 
                                    value={fabName}
                                    onChange={(e) => setFabName(e.target.value)}
                                    className="w-full p-4 rounded-xl border border-gray-200 focus:ring-1 focus:ring-black outline-none"
                                    placeholder="Ej: Lino Rústico"
                                />
                             </div>
                             <div>
                                <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Proveedor</label>
                                <input 
                                    value={fabSupplier}
                                    onChange={(e) => setFabSupplier(e.target.value)}
                                    className="w-full p-4 rounded-xl border border-gray-200 focus:ring-1 focus:ring-black outline-none uppercase"
                                    placeholder="Ej: CREATA"
                                />
                             </div>
                             
                             <button 
                                onClick={handleSaveFabric}
                                disabled={!fabName || !fabImage || isSaving}
                                className="w-full bg-black text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-xl disabled:opacity-50"
                             >
                                {isSaving ? 'Guardando...' : 'Guardar Tela'}
                             </button>
                             
                             <div className="pt-4 border-t border-gray-100">
                                 <button onClick={onReset} className="w-full text-center text-red-400 text-[10px] font-bold uppercase hover:text-red-600">
                                     Resetear Base de Datos
                                 </button>
                             </div>
                         </div>
                     )}
                 </div>
             )}

             {/* 2. TAB: RUGS (TAPETES) */}
             {activeTab === 'rug' && (
                 <div className="h-full flex flex-col pt-6 animate-fade-in">
                     <ModeToggle />

                     {isBulkMode ? (
                         <BulkUploadView />
                     ) : (
                         <div className="max-w-lg mx-auto w-full space-y-6 px-8 pb-8">
                             <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 mb-4">
                                 <p className="text-[10px] text-yellow-800 font-bold uppercase tracking-wide">
                                     Nota: Aquí subes la TEXTURA/FOTO del tapete para el visualizador.
                                 </p>
                             </div>

                             <div 
                                onClick={() => rugInputRef.current?.click()}
                                className="w-full aspect-[4/3] bg-white rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-black transition-colors relative overflow-hidden group"
                             >
                                {rugImage ? (
                                    <img src={rugImage} className="w-full h-full object-cover" />
                                ) : (
                                    <>
                                        <svg className="w-10 h-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        <span className="text-xs font-bold text-gray-400 uppercase">Foto del Tapete</span>
                                    </>
                                )}
                                <input ref={rugInputRef} type="file" className="hidden" accept="image/*" onChange={handleRugImageChange} />
                             </div>
                             
                             <div>
                                <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Nombre del Tapete</label>
                                <input 
                                    value={rugName}
                                    onChange={(e) => setRugName(e.target.value)}
                                    className="w-full p-4 rounded-xl border border-gray-200 focus:ring-1 focus:ring-black outline-none"
                                    placeholder="Ej: Persa Azul Vintage"
                                />
                             </div>
                             <div>
                                <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Proveedor</label>
                                <input 
                                    value={rugSupplier}
                                    onChange={(e) => setRugSupplier(e.target.value)}
                                    className="w-full p-4 rounded-xl border border-gray-200 focus:ring-1 focus:ring-black outline-none uppercase"
                                    placeholder="Ej: CREATA RUGS"
                                />
                             </div>
                             
                             <button 
                                onClick={handleSaveRug}
                                disabled={!rugName || !rugImage || isSaving}
                                className="w-full bg-black text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-xl disabled:opacity-50"
                             >
                                {isSaving ? 'Guardando...' : 'Guardar Tapete'}
                             </button>
                         </div>
                     )}
                 </div>
             )}

             {/* 3. TAB: WOODS */}
             {activeTab === 'wood' && (
                 <div className="max-w-lg mx-auto space-y-6 pt-8 px-8">
                     <div 
                        onClick={() => woodInputRef.current?.click()}
                        className="w-full aspect-video bg-white rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-black transition-colors relative overflow-hidden group"
                     >
                        {woodImage ? (
                            <img src={woodImage} className="w-full h-full object-cover" />
                        ) : (
                            <>
                                <svg className="w-10 h-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                <span className="text-xs font-bold text-gray-400 uppercase">Foto del Acabado</span>
                            </>
                        )}
                        <input ref={woodInputRef} type="file" className="hidden" accept="image/*" onChange={handleWoodImageChange} />
                     </div>
                     
                     <div>
                        <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Nombre del Acabado</label>
                        <input 
                            value={woodName}
                            onChange={(e) => setWoodName(e.target.value)}
                            className="w-full p-4 rounded-xl border border-gray-200 focus:ring-1 focus:ring-black outline-none"
                            placeholder="Ej: Nogal, Roble Claro..."
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Proveedor</label>
                        <input 
                            value={woodSupplier}
                            onChange={(e) => setWoodSupplier(e.target.value)}
                            className="w-full p-4 rounded-xl border border-gray-200 focus:ring-1 focus:ring-black outline-none uppercase"
                            placeholder="ARTEX"
                        />
                     </div>
                     
                     <button 
                        onClick={handleSaveWoodInternal}
                        disabled={!woodName || !woodImage || isSaving}
                        className="w-full bg-black text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-xl disabled:opacity-50"
                     >
                        {isSaving ? 'Guardando...' : 'Guardar Madera'}
                     </button>
                 </div>
             )}

             {/* 4. TAB: FURNITURE (MUEBLES) - Solo para sofás, sillas, etc. */}
             {activeTab === 'furniture' && (
                 <div className="max-w-lg mx-auto space-y-6 pt-8 px-8">
                     <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-4">
                         <p className="text-[10px] text-blue-800 font-bold uppercase tracking-wide">
                             Muebles: Sube un recorte (PNG/JPG con fondo blanco) del sofá o silla.
                         </p>
                     </div>

                     <div 
                        onClick={() => furnInputRef.current?.click()}
                        className="w-full aspect-square bg-white rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-black transition-colors relative overflow-hidden group"
                     >
                        {furnImage ? (
                            <img src={furnImage} className="w-full h-full object-contain p-4" />
                        ) : (
                            <>
                                <svg className="w-10 h-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                <span className="text-xs font-bold text-gray-400 uppercase">Foto del Mueble</span>
                            </>
                        )}
                        <input ref={furnInputRef} type="file" className="hidden" accept="image/*" onChange={handleFurnImageChange} />
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Nombre Modelo</label>
                            <input 
                                value={furnName}
                                onChange={(e) => setFurnName(e.target.value)}
                                className="w-full p-4 rounded-xl border border-gray-200 focus:ring-1 focus:ring-black outline-none"
                                placeholder="Ej: Sofá Chester"
                            />
                         </div>
                         <div>
                            <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Categoría</label>
                            <input 
                                value={furnCategory}
                                onChange={(e) => setFurnCategory(e.target.value)}
                                className="w-full p-4 rounded-xl border border-gray-200 focus:ring-1 focus:ring-black outline-none"
                                placeholder="Ej: Sofá, Silla, Butaca..."
                            />
                         </div>
                     </div>
                     <div>
                        <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Proveedor</label>
                        <input 
                            value={furnSupplier}
                            onChange={(e) => setFurnSupplier(e.target.value)}
                            className="w-full p-4 rounded-xl border border-gray-200 focus:ring-1 focus:ring-black outline-none uppercase"
                            placeholder="ARTEX"
                        />
                     </div>

                     <button 
                        onClick={handleSaveFurnitureInternal}
                        disabled={!furnName || !furnImage || isSaving}
                        className="w-full bg-black text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-xl disabled:opacity-50"
                     >
                        {isSaving ? 'Guardando...' : 'Guardar Mueble'}
                     </button>
                 </div>
             )}

             {/* 5. TAB: SCENE (ESCENAS) - Solo Nombre y Foto */}
             {activeTab === 'scene' && (
                 <div className="max-w-lg mx-auto space-y-6 pt-8 px-8">
                     <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 mb-4">
                         <p className="text-[10px] text-purple-800 font-bold uppercase tracking-wide">
                             Escenas: Sube una foto de una habitación vacía o ambiente para visualizar tapetes.
                         </p>
                     </div>

                     <div 
                        onClick={() => sceneInputRef.current?.click()}
                        className="w-full aspect-video bg-white rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-black transition-colors relative overflow-hidden group"
                     >
                        {sceneImage ? (
                            <img src={sceneImage} className="w-full h-full object-cover" />
                        ) : (
                            <>
                                <svg className="w-10 h-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                <span className="text-xs font-bold text-gray-400 uppercase">Foto del Lugar</span>
                            </>
                        )}
                        <input ref={sceneInputRef} type="file" className="hidden" accept="image/*" onChange={handleSceneImageChange} />
                     </div>
                     
                     <div>
                        <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Nombre de la Escena</label>
                        <input 
                            value={sceneName}
                            onChange={(e) => setSceneName(e.target.value)}
                            className="w-full p-4 rounded-xl border border-gray-200 focus:ring-1 focus:ring-black outline-none"
                            placeholder="Ej: Sala Principal Vacía"
                        />
                     </div>
                     
                     <button 
                        onClick={handleSaveScene}
                        disabled={!sceneName || !sceneImage || isSaving}
                        className="w-full bg-black text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-xl disabled:opacity-50"
                     >
                        {isSaving ? 'Guardando...' : 'Guardar Escena'}
                     </button>
                 </div>
             )}

          </div>
       </div>
    </div>
  );
};

export default UploadModal;
