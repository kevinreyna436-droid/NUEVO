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
      className="group relative w-48 h-64 bg-white rounded-[1.2rem] overflow-hidden cursor-pointer border border-gray-200 shadow-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-xl flex flex-col"
    >
      {/* SECTION SUPERIOR (Imagen Grande - Ocupa casi todo) */}
      <div className="relative h-44 w-full bg-gray-100 overflow-hidden flex-shrink-0">
        
        {/* Image */}
        <img 
          src={displayImage} 
          alt={mode === 'model' ? fabric.name : `${fabric.name} - ${specificColorName}`} 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />

        {/* Small subtle gradient at bottom instead of large arc to save space */}
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-black/10 to-transparent"></div>
      </div>

      {/* SECTION INFERIOR (Información Compacta) */}
      <div className="flex-1 px-3 py-2 text-center flex flex-col items-center justify-start bg-white relative">
        <div className="w-full -mt-1">
          {mode === 'model' ? (
            /* VISTA MODELOS */
            <>
              <h3 className="font-serif text-lg font-bold text-slate-900 leading-none mb-1">
                {fabric.name}
              </h3>
              <p className="text-[9px] text-gray-400 font-medium uppercase leading-tight line-clamp-1 px-1">
                {fabric.colors.join(', ')}
              </p>
            </>
          ) : (
            /* VISTA COLORES */
            <>
              <h3 className="font-serif text-base font-bold text-slate-900 leading-none mb-0.5">
                {specificColorName}
              </h3>
              <p className="text-[8px] text-gray-400 font-bold uppercase tracking-wider">
                {fabric.name}
              </p>
            </>
          )}
        </div>

        {/* Proveedor Compacto - Pegado al fondo, muy sutil */}
        <div className="mt-auto pt-1 w-full opacity-60">
            <p className="text-[8px] font-bold text-gray-300 tracking-[0.1em] uppercase">
                {fabric.supplier}
            </p>
        </div>
      </div>
    </div>
  );
};

export default FabricCard;