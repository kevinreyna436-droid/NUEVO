
import React from 'react';
import { Fabric } from '../types';
import { IN_STOCK_DB } from '../constants';

interface FabricCardProps {
  fabric: Fabric;
  onClick: () => void;
  mode: 'model' | 'color';
  specificColorName?: string;
  index: number;
}

const FabricCard: React.FC<FabricCardProps> = ({ fabric, onClick, mode, specificColorName }) => {
  // Determine which image to show
  let displayImage = fabric.mainImage;
  if (mode === 'color' && specificColorName && fabric.colorImages?.[specificColorName]) {
    displayImage = fabric.colorImages[specificColorName];
  }

  // Safe access to colors
  const colorList = fabric.colors || [];

  // Helper helper to force Sentence Case (First upper, rest lower) purely for display
  const toSentenceCase = (str: string) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  // --- LOGIC FOR STOCK INDICATOR (GREEN DOT) ---
  const isVerifiedStock = (): boolean => {
      // Find matching key in DB (case-insensitive)
      const modelKey = Object.keys(IN_STOCK_DB).find(k => k.toLowerCase() === fabric.name.toLowerCase());
      
      if (!modelKey) return false;

      if (mode === 'model') {
          // If in Model View, just checking if the Model exists in the Stock DB is enough (requested behavior)
          return true;
      } else if (mode === 'color' && specificColorName) {
          // If in Color View, check if the specific color exists in that model's list
          const stockColors = IN_STOCK_DB[modelKey];
          return stockColors.some(c => c.toLowerCase() === specificColorName.toLowerCase());
      }
      return false;
  };

  const showGreenDot = isVerifiedStock();

  return (
    <div 
      onClick={onClick}
      className="group relative w-full aspect-[3/4] md:aspect-[4/5] bg-white rounded-3xl shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden cursor-pointer flex flex-col hover:-translate-y-2 hover:scale-[0.97] transform-gpu scale-[0.95]"
    >
      {/* SECTION SUPERIOR (Imagen) - 70% height */}
      <div className="relative h-[70%] w-full bg-gray-100 overflow-hidden">
        {displayImage ? (
          <img 
            src={displayImage} 
            alt={mode === 'model' ? fabric.name : `${fabric.name} - ${specificColorName}`} 
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
              {/* Main Title - Sentence Case, No Uppercase Class */}
              <h3 className="font-serif text-lg md:text-xl font-medium text-slate-800 leading-tight mb-1 group-hover:text-black transition-colors px-1 line-clamp-1 tracking-tight">
                {toSentenceCase(fabric.name)}
              </h3>
              {/* Subtitle - Supplier Stays Uppercase */}
              <p className="text-[10px] md:text-xs font-semibold text-gray-400 uppercase tracking-widest leading-none">
                {fabric.supplier}
              </p>
              
              {/* Colors List (Footer info) */}
              <p className="text-[9px] text-gray-300 font-normal leading-snug px-1 tracking-wide line-clamp-1 mt-2">
                {colorList.map(c => toSentenceCase(c)).join(', ')}
              </p>
            </>
          ) : (
            /* VISTA COLORES */
            <>
              {/* Main Title - Color Name in Sentence Case */}
              <h3 className="font-serif text-lg md:text-xl font-medium text-slate-800 leading-tight mb-1 group-hover:text-black transition-colors px-1 line-clamp-2 break-words">
                {toSentenceCase(specificColorName || '')}
              </h3>
              
              {/* Subtitle - Model Name in Sentence Case */}
              <p className="text-[10px] md:text-xs font-semibold text-gray-400 tracking-widest leading-none">
                {toSentenceCase(fabric.name)}
              </p>
              {/* Supplier Stays Uppercase */}
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

export default FabricCard;
