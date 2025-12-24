
import React, { memo, useState } from 'react';
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
  const [imgError, setImgError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Determine which image to show
  let displayImage = fabric.mainImage;
  if (mode === 'color' && specificColorName && fabric.colorImages?.[specificColorName]) {
    displayImage = fabric.colorImages[specificColorName];
  }

  // Check if image is cloud-hosted (starts with http) or local only (starts with data:)
  const isCloudStored = displayImage && displayImage.startsWith('http');
  const isLocalOnly = displayImage && displayImage.startsWith('data:');

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
        
        {/* Skeleton Loader - Displays until image is loaded */}
        {!isLoaded && !imgError && displayImage && (
            <div className="absolute inset-0 bg-gray-200 animate-pulse z-10"></div>
        )}

        {displayImage && !imgError ? (
          <img 
            src={displayImage} 
            alt={mode === 'model' ? fabric.name : `${fabric.name} - ${specificColorName}`} 
            loading="lazy"
            decoding="async"
            onLoad={() => setIsLoaded(true)}
            onError={() => setImgError(true)}
            className={`w-full h-full object-cover object-center transition-all duration-700 scale-[1.1] group-hover:scale-[1.15] ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-50 group-hover:bg-gray-100 transition-colors flex-col">
            <svg className="w-8 h-8 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div className="text-center">
              <span className="block font-serif text-3xl md:text-4xl text-gray-200 font-bold opacity-50 mb-1">
                 {fabric.name.charAt(0)}
              </span>
              <span className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">
                 Sin Foto
              </span>
            </div>
          </div>
        )}
        
        {/* STOCK INDICATOR - GREEN DOT */}
        {showGreenDot && (
            <div 
                className="absolute bottom-3 right-3 z-30 w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow-sm" 
                title={mode === 'model' ? "Modelo en Stock" : "Color en Stock"}
            ></div>
        )}

        {/* CLOUD SYNC STATUS INDICATOR */}
        {isLocalOnly ? (
            <div className="absolute top-3 right-3 z-30 text-yellow-600 bg-yellow-100 p-1.5 rounded-full shadow-sm animate-pulse" title="Pendiente de subir a la nube">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            </div>
        ) : isCloudStored ? (
            // Icono sutil de nube solo para confirmar (opcional, o se puede quitar para limpieza)
            <div className="absolute top-3 right-3 z-30 text-white/40 bg-black/20 p-1 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity" title="Seguro en la Nube">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
        ) : null}

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
