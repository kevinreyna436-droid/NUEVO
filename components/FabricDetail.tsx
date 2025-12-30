
import React, { useState, useEffect } from 'react';
import { Fabric } from '../types';
import EditFabricModal from './EditFabricModal';
import PinModal from './PinModal';
import { generateFormatexSKU, isFormatexSupplier } from '../utils/skuUtils';
import { IN_STOCK_DB } from '../constants';
import { jsPDF } from "jspdf";

interface FabricDetailProps {
  fabric: Fabric;
  onBack: () => void;
  onEdit: (updatedFabric: Fabric) => void;
  onDelete: (id: string) => void;
  onVisualize: (fabric: Fabric, color: string) => void;
}

const FabricDetail: React.FC<FabricDetailProps> = ({ fabric, onBack, onEdit, onDelete, onVisualize }) => {
  const [showSpecs, setShowSpecs] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [isPinModalOpen, setPinModalOpen] = useState(false); // PIN Modal State
  
  // Sort colors alphabetically for display, handle undefined colors safely
  const sortedColors = [...(fabric.colors || [])].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  
  // Check if supplier matches Formatex rules
  const isFormatex = isFormatexSupplier(fabric.supplier);

  // Helper for Sentence Casing (First upper, rest lower)
  const toSentenceCase = (str: string) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  // Helper to check stock
  const isColorInStock = (colorName: string): boolean => {
      const modelKey = Object.keys(IN_STOCK_DB).find(k => k.toLowerCase() === fabric.name.toLowerCase());
      if (!modelKey) return false;
      const stockColors = IN_STOCK_DB[modelKey];
      return stockColors.some(c => c.toLowerCase() === colorName.toLowerCase());
  };

  // Keydown listener for arrow keys in lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex !== null) {
        if (e.key === 'ArrowRight') handleNextImage(e);
        if (e.key === 'ArrowLeft') handlePrevImage(e);
        if (e.key === 'Escape') setLightboxIndex(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex]);

  const handleNextImage = (e?: React.MouseEvent | KeyboardEvent) => {
    e?.stopPropagation();
    if (lightboxIndex !== null && sortedColors.length > 0) {
      setLightboxIndex((prev) => (prev! + 1) % sortedColors.length);
    }
  };

  const handlePrevImage = (e?: React.MouseEvent | KeyboardEvent) => {
    e?.stopPropagation();
    if (lightboxIndex !== null && sortedColors.length > 0) {
      setLightboxIndex((prev) => (prev! - 1 + sortedColors.length) % sortedColors.length);
    }
  };

  const getLightboxImage = () => {
    if (lightboxIndex === null) return null;
    const colorName = sortedColors[lightboxIndex];
    return fabric.colorImages?.[colorName] || fabric.mainImage;
  };

  const handleEditClick = () => {
      setPinModalOpen(true);
  };

  const handleDownloadFicha = async (e: React.MouseEvent) => {
      e.preventDefault(); // Control total del evento
      
      // OPCIÓN A: DESCARGAR ORIGINAL
      // Si existe una URL de PDF (ya sea Base64 o URL remota), la descargamos directamente.
      if (fabric.pdfUrl) {
          try {
              const link = document.createElement('a');
              link.href = fabric.pdfUrl;
              
              // Sanitizar nombre de archivo
              const safeName = fabric.name.replace(/\s+/g, '_');
              link.download = `Ficha_Original_${safeName}.pdf`;
              link.target = '_blank'; // Ayuda con algunos navegadores y URLs remotas
              
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
          } catch (err) {
              console.error("Error iniciando descarga del PDF original", err);
              alert("Error al intentar descargar el archivo original.");
          }
          return;
      }
      
      // OPCIÓN B: GENERAR PDF (Si no hay original)
      // Initialize PDF Generator (Fallback)
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // -- HEADER --
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("CREATA COLLECTION", 20, 20);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("FICHA TÉCNICA DE PRODUCTO", 20, 26);
      
      doc.setDrawColor(0);
      doc.setLineWidth(0.5);
      doc.line(20, 30, pageWidth - 20, 30);

      // -- MAIN INFO (LEFT COLUMN) --
      let y = 45;
      doc.setFontSize(12);
      
      doc.setFont("helvetica", "bold");
      doc.text("MODELO:", 20, y);
      doc.setFont("helvetica", "normal");
      doc.text(toSentenceCase(fabric.name), 60, y);
      y += 10;

      doc.setFont("helvetica", "bold");
      doc.text("PROVEEDOR:", 20, y);
      doc.setFont("helvetica", "normal");
      doc.text(fabric.supplier || "N/A", 60, y);
      y += 10;

      doc.setFont("helvetica", "bold");
      doc.text("COLECCIÓN:", 20, y);
      doc.setFont("helvetica", "normal");
      doc.text(fabric.customCatalog || (fabric.category === 'wood' ? 'Maderas' : 'Textil'), 60, y);
      y += 15;

      // -- SPECS --
      doc.setFont("helvetica", "bold");
      doc.text("ESPECIFICACIONES:", 20, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      
      if (fabric.specs.composition) {
          doc.text(`• Composición: ${fabric.specs.composition}`, 20, y);
          y += 6;
      }
      if (fabric.specs.martindale) {
          doc.text(`• Durabilidad: ${fabric.specs.martindale}`, 20, y);
          y += 6;
      }
      if (fabric.specs.weight) {
          doc.text(`• Peso: ${fabric.specs.weight}`, 20, y);
          y += 6;
      }
      
      y += 5;

      // -- SUMMARY TEXT --
      if (fabric.technicalSummary) {
          doc.setFont("helvetica", "bold");
          doc.text("DESCRIPCIÓN:", 20, y);
          y += 6;
          doc.setFont("helvetica", "normal");
          // Split text to fit width
          const splitText = doc.splitTextToSize(fabric.technicalSummary, 100); 
          doc.text(splitText, 20, y);
          y += (splitText.length * 5) + 10;
      }

      // -- IMAGE (RIGHT SIDE) --
      // Try to add image if base64
      if (fabric.mainImage && fabric.mainImage.startsWith('data:image')) {
          try {
              // Add image at top right: x=130, y=35, w=60, h=60 (approx square)
              doc.addImage(fabric.mainImage, 'JPEG', 130, 35, 60, 60, undefined, 'FAST');
          } catch (err) {
              console.warn("Could not add image to PDF", err);
          }
      }

      // -- COLORS LIST (FULL WIDTH BELOW) --
      // Ensure y is below image (at least 110)
      if (y < 110) y = 110;
      
      doc.setDrawColor(200);
      doc.line(20, y, pageWidth - 20, y);
      y += 10;

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("VARIANTES Y CÓDIGOS (SKU)", 20, y);
      y += 10;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");

      // Grid Layout for Colors
      const col1X = 20;
      const col2X = 110;
      let currentX = col1X;
      
      sortedColors.forEach((color, index) => {
          // Check for page break
          if (y > 270) {
              doc.addPage();
              y = 20;
          }

          let lineText = `• ${toSentenceCase(color)}`;
          
          if (isFormatex) {
              const sku = generateFormatexSKU(fabric.name, color);
              lineText += `  [SKU: ${sku}]`;
          }

          doc.text(lineText, currentX, y);

          // Alternar columnas
          if (currentX === col1X) {
              currentX = col2X;
          } else {
              currentX = col1X;
              y += 7; // Nueva fila
          }
      });

      // Footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Generado por Creata App - Página ${i} de ${pageCount}`, pageWidth / 2, 290, { align: 'center' });
      }

      doc.save(`Ficha_Tecnica_${fabric.name.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="min-h-screen bg-[#f2f2f2] pb-20 animate-fade-in-up relative">
      
      {/* PIN Modal for Edit */}
      <PinModal 
        isOpen={isPinModalOpen} 
        onClose={() => setPinModalOpen(false)} 
        onSuccess={() => setEditModalOpen(true)} 
      />

      {/* Edit Modal */}
      {isEditModalOpen && (
        <EditFabricModal 
          fabric={fabric} 
          onClose={() => setEditModalOpen(false)} 
          onSave={(updated) => {
            onEdit(updated);
            setEditModalOpen(false);
          }}
          onDelete={() => {
              // Trigger the delete logic passed from App
              onDelete(fabric.id);
          }}
        />
      )}

      {/* Lightbox Overlay */}
      {lightboxIndex !== null && (
        <div 
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center cursor-pointer p-4 md:p-8"
            onClick={() => setLightboxIndex(null)}
        >
            <button 
              onClick={handlePrevImage}
              className="absolute left-2 md:left-8 text-white/80 hover:text-white hover:scale-110 transition-all p-3 z-[110] bg-black/20 rounded-full backdrop-blur-sm border border-white/10"
            >
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>

            <div 
                className="relative bg-white shadow-2xl rounded-sm overflow-hidden flex items-center justify-center border border-white/10
                           w-[90vw] h-[90vw] md:w-[80vh] md:h-[80vh]"
                onClick={(e) => e.stopPropagation()} 
            >
               <img 
                  src={getLightboxImage()!} 
                  alt="Full Texture" 
                  className="w-full h-full object-contain"
               />

               {/* PREMIUM ACTION BUTTON */}
               <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-[120]">
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            if (lightboxIndex !== null) {
                                const color = sortedColors[lightboxIndex];
                                onVisualize(fabric, color);
                            }
                        }}
                        className="bg-white text-black px-10 py-4 rounded-full font-serif font-bold text-sm uppercase tracking-[0.25em] shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:bg-black hover:text-white transition-all duration-500 border border-gray-100 hover:scale-105"
                    >
                        Utilizar
                    </button>
               </div>
            </div>

            <button 
              onClick={handleNextImage}
              className="absolute right-2 md:right-8 text-white/80 hover:text-white hover:scale-110 transition-all p-3 z-[110] bg-black/20 rounded-full backdrop-blur-sm border border-white/10"
            >
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>

            <button 
              onClick={() => setLightboxIndex(null)}
              className="absolute top-6 right-6 text-white/70 hover:text-white z-[110]"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
      )}

      {/* Specs Modal (Replaces Inline Expansion) */}
      {showSpecs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-fade-in" onClick={() => setShowSpecs(false)}>
            <div 
                className="bg-white w-full max-w-2xl rounded-3xl p-10 md:p-12 shadow-2xl relative max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <button 
                    onClick={() => setShowSpecs(false)} 
                    className="absolute top-6 right-6 text-gray-400 hover:text-black transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                <h3 className="font-serif text-3xl font-bold mb-6 text-slate-900 leading-tight">Resumen Técnico</h3>
                
                {/* 1. Show Image IF Exists */}
                {fabric.specsImage && (
                     <div className="mb-8 rounded-lg overflow-hidden border border-gray-100">
                         <img src={fabric.specsImage} alt="Ficha Técnica Visual" className="w-full h-auto object-contain" />
                         <p className="text-[10px] text-gray-400 text-center mt-2 uppercase tracking-widest">Documento escaneado</p>
                     </div>
                )}

                {/* 2. Show Extracted Data ALWAYS (if available), regardless of image */}
                <div className="mt-4">
                     {fabric.technicalSummary ? (
                        <p className="text-gray-600 mb-10 leading-relaxed font-sans text-lg border-b border-gray-100 pb-8">
                            {fabric.technicalSummary}
                        </p>
                     ) : (
                        <p className="text-gray-400 italic mb-10 text-sm">
                            Información técnica no disponible. <br/>
                            <span className="text-[10px] not-italic">Usa el botón "." para editar y agregar datos manualmente.</span>
                        </p>
                     )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
                        {fabric.specs.composition && (
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2 font-sans">Composición</span>
                                <span className="text-xl text-slate-900 font-medium font-serif leading-tight">{fabric.specs.composition}</span>
                            </div>
                        )}
                        {fabric.specs.martindale && (
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2 font-sans">Durabilidad</span>
                                <span className="text-xl text-slate-900 font-medium font-serif leading-tight">{fabric.specs.martindale}</span>
                            </div>
                        )}
                        {fabric.specs.weight && (
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2 font-sans">Peso</span>
                                <span className="text-xl text-slate-900 font-medium font-serif leading-tight">{fabric.specs.weight}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end pt-2">
                     <button 
                       onClick={handleDownloadFicha}
                       className="flex items-center space-x-2 bg-black text-white px-8 py-4 rounded-full text-xs font-bold uppercase hover:bg-gray-800 transition-colors shadow-lg tracking-widest cursor-pointer"
                     >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        <span>{fabric.pdfUrl ? 'Descargar PDF Original' : 'Generar PDF'}</span>
                     </button>
                </div>
            </div>
        </div>
      )}

      {/* Navigation - Botones Flotantes (Reemplaza la barra sticky) */}
      <div className="fixed top-0 left-0 w-full p-6 z-40 flex justify-between items-start pointer-events-none">
          {/* Botón Volver (Rectángulo) */}
          <button
              onClick={onBack}
              className="pointer-events-auto bg-white text-slate-900 px-6 py-3 rounded-xl shadow-lg border border-gray-100 flex items-center gap-3 transition-all hover:scale-105 hover:shadow-xl group"
          >
               <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-colors">
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
               </div>
               <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Volver</span>
          </button>

          {/* Botón Editar (Punto discreto) */}
          <button
              onClick={handleEditClick}
              className="pointer-events-auto w-10 h-10 bg-white/50 hover:bg-white backdrop-blur-md rounded-full text-gray-400 hover:text-black transition-all font-bold text-2xl flex items-center justify-center shadow-sm hover:shadow-md"
              title="Modificar ficha completa"
          >
              .
          </button>
      </div>

      <div className="container mx-auto px-4 py-6 flex flex-col items-center text-center max-w-5xl mt-16">
        
        {/* 1. Centered Header Info */}
        <div className="mb-6 space-y-2">
            <h2 className="text-gray-400 italic font-serif text-base tracking-wide">CREATA</h2>
            {/* Visual Sentence Case for Name */}
            <h1 className="font-serif text-6xl md:text-8xl font-bold text-slate-900 tracking-tight leading-none">
                {toSentenceCase(fabric.name)}
            </h1>
            <p className="text-sm text-gray-500 font-bold uppercase tracking-[0.25em] pt-2">
                {fabric.supplier}
            </p>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-widest pt-1">
                {fabric.customCatalog ? fabric.customCatalog : (fabric.category === 'wood' ? 'Colección Maderas' : 'Colección Textil')}
            </p>
        </div>

        {/* Trigger for Specs Modal */}
        <div className="w-full max-w-3xl mb-16">
            <button 
                onClick={() => setShowSpecs(true)}
                className="group flex items-center justify-center mx-auto space-x-2 text-sm font-medium text-gray-500 hover:text-black transition-colors px-6 py-3 rounded-full border border-gray-300 hover:border-black hover:bg-white"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                <span>Ficha técnica</span>
            </button>
        </div>

        {/* 2. Muestrario Interactivo (Circular Grid) */}
        <div className="w-full">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-[0.25em] mb-16">Variantes de Color</h3>
            
            <div className="flex flex-wrap justify-center gap-20 gap-y-32">
              {sortedColors.map((color, idx) => {
                const colorImg = fabric.colorImages?.[color] || fabric.mainImage;
                const showStockDot = isColorInStock(color);
                
                return (
                  <div key={idx} className="flex flex-col items-center group w-64">
                    <div 
                      onClick={() => setLightboxIndex(idx)} 
                      className="relative w-64 h-64 rounded-full border-[1px] border-gray-300 overflow-hidden cursor-pointer bg-white shadow-md transition-all duration-500 hover:shadow-2xl hover:scale-105"
                    >
                       <img 
                         src={colorImg} 
                         alt={color} 
                         className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                       />
                       
                       {/* HOVER OVERLAY WITH LUPA + ICON (Small White) */}
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                          <svg className="w-6 h-6 text-white drop-shadow-md transform scale-75 group-hover:scale-100 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                          </svg>
                       </div>
                    </div>
                    
                    {/* Visual Sentence Case for color name forced here + Stock Dot */}
                    <div className="flex items-center gap-2 mt-3">
                        <p className="text-lg font-bold text-slate-900 tracking-widest text-center group-hover:text-black transition-colors">
                            {toSentenceCase(color)}
                        </p>
                        {showStockDot && (
                            <div className="w-2.5 h-2.5 bg-green-500 rounded-full border border-white shadow-sm" title="En Stock"></div>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {sortedColors.length === 0 && (
                <p className="text-base text-gray-400 italic py-10">No hay variantes cargadas.</p>
            )}
        </div>

      </div>
    </div>
  );
};

export default FabricDetail;
