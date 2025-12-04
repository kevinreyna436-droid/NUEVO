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
      className="group relative w-52 h-80 bg-white rounded-[1.5rem] overflow-hidden cursor-pointer border border-gray-100 shadow-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-xl flex flex-col"
    >
      {/* SECTION SUPERIOR (Imagen Grande ~60%) */}
      <div className="relative h-48 w-full bg-gray-50 overflow-hidden flex-shrink-0">
        
        {/* Image */}
        <img 
          src={displayImage} 
          alt={mode === 'model' ? fabric.name : `${fabric.name} - ${specificColorName}`} 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />

        {/* Decorative Arc */}
        <div className="absolute -bottom-6 left-0 right-0 h-12 bg-white rounded-t-[50%] scale-x-150"></div>
      </div>

      {/* SECTION INFERIOR (Información ~40%) */}
      <div className="flex-1 px-4 py-2 text-center flex flex-col items-center justify-start relative z-10 bg-white space-y-2">
        <div className="w-full mt-1">
          {mode === 'model' ? (
            /* VISTA MODELOS */
            <>
              <h3 className="font-serif text-xl font-bold text-slate-900 leading-tight mb-1">
                {fabric.name}
              </h3>
              <p className="text-[10px] text-gray-400 font-medium uppercase leading-relaxed line-clamp-2 px-1">
                {fabric.colors.join(', ')}
              </p>
            </>
          ) : (
            /* VISTA COLORES */
            <>
              <h3 className="font-serif text-lg font-bold text-slate-900 leading-tight mb-1">
                {specificColorName}
              </h3>
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                {fabric.name}
              </p>
            </>
          )}
        </div>

        {/* Proveedor Compacto - Always at bottom */}
        <div className="mt-auto pb-3 w-full opacity-70">
            <p className="text-[9px] font-bold text-gray-300 tracking-[0.2em] uppercase">
                {fabric.supplier}
            </p>
        </div>
      </div>
    </div>
  );
};

export default FabricCard;