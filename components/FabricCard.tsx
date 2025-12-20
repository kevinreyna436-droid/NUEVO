
import React, { memo } from 'react';
import { Fabric } from '../types';
import { IN_STOCK_DB } from '../constants';

interface FabricCardProps {
  fabric: Fabric;
  onClick: () => void; // Main Click (Context dependent)
  onDetail: () => void; // Go to Detail View
  onQuickView: (img: string) => void; // Open Lightbox
  onVisualize: () => void; // Go to Visualizer
  mode: 'model' | 'color';
  specificColorName?: string;
  index: number;
}

const FabricCard: React.FC<FabricCardProps> = ({ fabric, onClick, onDetail, onQuickView, onVisualize, mode, specificColorName }) => {
  // Determine which image to show
  let displayImage = fabric.mainImage;
  if (mode === 'color' && specificColorName && fabric.colorImages?.[specificColorName]) {
    displayImage = fabric.colorImages[specificColorName];
  }

  // Safe access to colors
  const colorList = fabric.colors || [];

  const toSentenceCase = (str: string) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  // --- LOGIC FOR STOCK INDICATOR (GREEN DOT) ---
  const isVerifiedStock = (): boolean => {
      const modelKey = Object.keys(IN_STOCK_DB).find(k => k.toLowerCase() === fabric.name.toLowerCase());
      if (!modelKey) return false;

      if (mode === 'model') {
          return true;
      } else if (mode === 'color' && specificColorName) {
          const stockColors = IN_STOCK_DB[modelKey];
          return stockColors.some(c => c.toLowerCase() === specificColorName.toLowerCase());
      }
      return false;
  };

  const showGreenDot = isVerifiedStock();

  // In Color Mode: Main Click = Lightbox (User Request)
  // In Model Mode: Main Click = Detail View
  const handleMainClick = (e: React.MouseEvent) => {
      if (mode === 'color') {
          onQuickView(displayImage);
      } else {
          onClick();
      }
  };

  return (
    <div 
      onClick={handleMainClick}
      className="group relative w-full aspect-[3/4] md:aspect-[4/5] bg-white rounded-3xl shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden cursor-pointer flex flex-col hover:-translate-y-2 hover:scale-[0.97] transform-gpu scale-[0.95]"
    >
      {/* SECTION SUPERIOR (Imagen) - 70% height */}
      <div className="relative h-[70%] w-full bg-gray-100 overflow-hidden">
        {displayImage ? (
          <img 
            src={displayImage} 
            alt={mode === 'model' ? fabric.name : `${fabric.name} - ${specificColorName}`} 
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover object-center transition-transform duration-700 scale-[1.1] group-hover:scale-[1.15]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-50 group-hover:bg-gray-100 transition-colors">
            <div className="text-center">
              <span className="block font-serif text-3xl md:text-4xl text-gray-200 font-bold opacity-50 mb-2">
                 {fabric.name.charAt(0)}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-gray-300">
                 Sin Foto
              </span>
            </div>
          </div>
        )}
        
        {/* OVERLAY DE ACCIONES */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-4 backdrop-blur-[2px] z-40">
            {/* Botón Ampliar (Lightbox) */}
            <button 
                onClick={(e) => { e.stopPropagation(); onQuickView(displayImage); }}
                className="w-12 h-12 bg-white/20 hover:bg-white text-white hover:text-black rounded-full backdrop-blur-md flex items-center justify-center transition-all duration-300 transform translate-y-4 group-hover:translate-y-0"
                title="Ampliar Foto"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg>
            </button>

            {/* Botón Ver Detalle / Colección */}
            <button 
                onClick={(e) => { e.stopPropagation(); onDetail(); }}
                className="px-6 py-2 bg-white text-black text-[10px] font-bold uppercase tracking-widest rounded-full shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 delay-75 hover:scale-105"
            >
                {mode === 'model' ? 'Ver Colección' : 'Ver Ficha Modelo'}
            </button>

            {/* Botón Probar */}
            <button 
                onClick={(e) => { e.stopPropagation(); onVisualize(); }}
                className="w-12 h-12 bg-[oklch(0.58_0.07_251)] hover:brightness-110 text-white rounded-full backdrop-blur-md flex items-center justify-center transition-all duration-300 transform translate-y-4 group-hover:translate-y-0 delay-100 shadow-lg"
                title="Probar en mueble"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
            </button>
        </div>
        
        {/* STOCK INDICATOR - GREEN DOT */}
        {showGreenDot && (
            <div 
                className="absolute bottom-3 right-3 z-30 w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow-sm" 
                title={mode === 'model' ? "Modelo en Stock" : "Color en Stock"}
            ></div>
        )}

        {/* Curved Wave Separator (SVG) */}
        <div className="absolute bottom-[-1px] left-0 w-full text-white pointer-events-none z-10">
             <svg 
               viewBox="0 0 1440 120" 
               className="w-full h-auto block fill-current"
               preserveAspectRatio="none"
             >
               <path d="M0,60 C480,130 960,130 1440,60 L1440,120 L0,120 Z" />
             </svg>
        </div>
      </div>

      {/* SECTION INFERIOR (Información) - 30% height */}
      <div className="h-[30%] px-4 pb-2 text-center flex flex-col items-center justify-start pt-3 bg-white relative z-20">
        <div className="w-full flex flex-col justify-center h-full space-y-1">
          {mode === 'model' ? (
            /* VISTA MODELOS */
            <>
              <h3 className="font-serif text-lg md:text-xl font-medium text-slate-800 leading-tight mb-1 group-hover:text-black transition-colors px-1 line-clamp-1 tracking-tight">
                {toSentenceCase(fabric.name)}
              </h3>
              <p className="text-[10px] md:text-xs font-semibold text-gray-400 uppercase tracking-widest leading-none">
                {fabric.supplier}
              </p>
              <p className="text-[9px] text-gray-300 font-normal leading-snug px-1 tracking-wide line-clamp-1 mt-2">
                {colorList.map(c => toSentenceCase(c)).join(', ')}
              </p>
            </>
          ) : (
            /* VISTA COLORES */
            <>
              <h3 className="font-serif text-lg md:text-xl font-medium text-slate-800 leading-tight mb-1 group-hover:text-black transition-colors px-1 line-clamp-2 break-words">
                {toSentenceCase(specificColorName || '')}
              </h3>
              <p className="text-[10px] md:text-xs font-semibold text-gray-400 tracking-widest leading-none">
                {toSentenceCase(fabric.name)}
              </p>
               <p className="text-[9px] text-gray-300 font-semibold uppercase tracking-widest leading-none mt-1">
                {fabric.supplier}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(FabricCard);
