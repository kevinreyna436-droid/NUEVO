import React from 'react';
import { Fabric } from '../types';

interface FabricCardProps {
  fabric: Fabric;
  onClick: () => void;
  mode: 'model' | 'color';
  specificColorName?: string;
}

const FabricCard: React.FC<FabricCardProps> = ({ fabric, onClick, mode, specificColorName }) => {
  // Determine which image to show
  let displayImage = fabric.mainImage;
  if (mode === 'color' && specificColorName && fabric.colorImages?.[specificColorName]) {
    displayImage = fabric.colorImages[specificColorName];
  }
  
  return (
    <div 
      onClick={onClick}
      className="group relative w-60 h-[22rem] bg-white rounded-[2rem] overflow-hidden cursor-pointer border border-gray-100 shadow-sm transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl flex flex-col"
    >
      {/* SECTION SUPERIOR (Imagen Grande) */}
      <div className="relative h-56 w-full bg-gray-50 overflow-hidden flex-shrink-0">
        
        {/* Image */}
        <img 
          src={displayImage} 
          alt={mode === 'model' ? fabric.name : `${fabric.name} - ${specificColorName}`} 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />

        {/* Decorative Arc */}
        <div className="absolute -bottom-6 left-0 right-0 h-12 bg-white rounded-t-[50%] scale-x-150"></div>
      </div>

      {/* SECTION INFERIOR (Información) - Compact & Aligned Top */}
      <div className="flex-1 px-4 pt-4 pb-3 text-center flex flex-col items-center justify-start relative z-10 bg-white space-y-1">
        <div className="w-full">
          {mode === 'model' ? (
            /* VISTA MODELOS */
            <>
              <h3 className="font-serif text-3xl font-bold text-slate-900 leading-tight mb-1">
                {fabric.name}
              </h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest line-clamp-2 px-2">
                {fabric.colors.join(', ')}
              </p>
            </>
          ) : (
            /* VISTA COLORES */
            <>
              <h3 className="font-serif text-2xl font-bold text-slate-900 leading-tight mb-1">
                {specificColorName}
              </h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">
                {fabric.name}
              </p>
            </>
          )}
        </div>

        {/* Proveedor - Closer to content */}
        <div className="mt-3 pt-2 border-t border-gray-50 w-full opacity-60 group-hover:opacity-100 transition-opacity">
            <p className="text-[9px] font-bold text-gray-300 tracking-[0.25em] uppercase">
                {fabric.supplier}
            </p>
        </div>
      </div>
    </div>
  );
};

export default FabricCard;