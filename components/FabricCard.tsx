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
      // Square shape
      className="group relative w-full aspect-square bg-white rounded-3xl shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden cursor-pointer flex flex-col hover:-translate-y-1"
    >
      {/* SECTION SUPERIOR (Imagen) - Reduced slightly to give text more room (68%) */}
      <div className="relative h-[68%] w-full bg-gray-100 overflow-hidden">
        {/* Image */}
        <img 
          src={displayImage} 
          alt={mode === 'model' ? fabric.name : `${fabric.name} - ${specificColorName}`} 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        
        {/* Overlay subtle gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

        {/* RECTANGULAR SEPARATOR (Clean straight line implied by div background) */}
        {/* Previous SVG was removed here as requested */}
      </div>

      {/* SECTION INFERIOR (Información) - Increased height (32%) */}
      <div className="h-[32%] px-3 pb-2 pt-1 text-center flex flex-col items-center justify-center bg-white relative z-20">
        <div className="w-full flex flex-col justify-center h-full">
          {mode === 'model' ? (
            /* VISTA MODELOS */
            <>
              <h3 className="font-serif text-lg md:text-xl font-bold text-slate-900 leading-tight mb-1 group-hover:text-black transition-colors px-1 line-clamp-1">
                {fabric.name}
              </h3>
              {/* Added Supplier Name */}
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 leading-none">
                {fabric.supplier}
              </p>
              
              <div className="w-8 h-[1px] bg-gray-200 mx-auto my-1"></div>
              
              <p className="text-[10px] md:text-[11px] text-gray-400 font-medium uppercase leading-snug px-1 tracking-wide line-clamp-2">
                {colorList.join(', ')}
              </p>
            </>
          ) : (
            /* VISTA COLORES */
            <>
              <h3 className="font-serif text-base md:text-lg font-bold text-slate-900 leading-none mb-1 group-hover:text-black line-clamp-1 px-1">
                {specificColorName}
              </h3>
               <div className="w-6 h-[1px] bg-gray-200 mx-auto my-1"></div>
              
              {/* Fabric Name + Supplier */}
              <p className="text-[9px] md:text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5 line-clamp-1">
                {fabric.name}
              </p>
               <p className="text-[8px] text-gray-300 font-bold uppercase tracking-widest leading-none">
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