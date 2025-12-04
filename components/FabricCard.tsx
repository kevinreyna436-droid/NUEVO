import React from 'react';
import { Fabric } from '../types';

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

  return (
    <div 
      onClick={onClick}
      // Added scale-[0.95] to reduce size by 5% as requested previously
      className="group relative w-full aspect-[3/4] md:aspect-[4/5] bg-white rounded-3xl shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden cursor-pointer flex flex-col hover:-translate-y-2 hover:scale-[0.97] transform-gpu scale-[0.95]"
    >
      {/* SECTION SUPERIOR (Imagen) - 70% height */}
      <div className="relative h-[70%] w-full bg-gray-100 overflow-hidden">
        {/* Image */}
        <img 
          src={displayImage} 
          alt={mode === 'model' ? fabric.name : `${fabric.name} - ${specificColorName}`} 
          // UPDATED: 
          // 1. object-top: Anchors image to the top edge.
          // 2. scale-[1.40]: Aggressive zoom to crop margin (was 1.35).
          // 3. translate-y-14: Aggressive downward shift to hide bottom text/labels (was 12).
          className="w-full h-full object-cover object-top transition-transform duration-700 scale-[1.40] translate-y-14 group-hover:scale-[1.50] group-hover:translate-y-12"
        />
        
        {/* Curved Wave Separator (SVG) - Fills the gaps with photo */}
        <div className="absolute bottom-[-1px] left-0 w-full text-white pointer-events-none z-10">
             <svg 
               viewBox="0 0 1440 120" 
               className="w-full h-auto block fill-current"
               preserveAspectRatio="none"
             >
                {/* A gentle curve that goes up in the middle */}
               <path d="M0,60 C480,130 960,130 1440,60 L1440,120 L0,120 Z" />
             </svg>
        </div>
      </div>

      {/* SECTION INFERIOR (Información) - 30% height */}
      <div className="h-[30%] px-4 pb-2 text-center flex flex-col items-center justify-start pt-2 bg-white relative z-20">
        <div className="w-full flex flex-col justify-center h-full space-y-1">
          {mode === 'model' ? (
            /* VISTA MODELOS */
            <>
              {/* Main Title - Standardized */}
              <h3 className="font-serif text-xl md:text-2xl font-medium text-slate-800 leading-tight mb-0.5 group-hover:text-black transition-colors px-1 line-clamp-1">
                {fabric.name}
              </h3>
              {/* Supplier Name - Standardized */}
              <p className="text-[10px] md:text-xs font-semibold text-gray-400 uppercase tracking-widest leading-none">
                {fabric.supplier}
              </p>
              
              {/* Colors List */}
              <p className="text-[9px] md:text-[10px] text-gray-400 font-normal uppercase leading-snug px-1 tracking-wide line-clamp-1 mt-2">
                {colorList.join(', ')}
              </p>
            </>
          ) : (
            /* VISTA COLORES */
            <>
              {/* Main Title - Matches Model View */}
              <h3 className="font-serif text-xl md:text-2xl font-medium text-slate-800 leading-tight mb-0.5 group-hover:text-black transition-colors px-1 line-clamp-2 break-words">
                {specificColorName}
              </h3>
              
              {/* Supplier/Fabric - Matches Model View */}
              <p className="text-[10px] md:text-xs font-semibold text-gray-400 uppercase tracking-widest leading-none mt-0.5">
                {fabric.name}
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

export default FabricCard;