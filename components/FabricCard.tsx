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
      // Changed to aspect-square to force square shape
      className="group relative w-full aspect-square bg-white rounded-3xl shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden cursor-pointer flex flex-col hover:-translate-y-1"
    >
      {/* SECTION SUPERIOR (Imagen) - Takes 75% of the square */}
      <div className="relative h-[75%] w-full bg-gray-100 overflow-hidden">
        {/* Image */}
        <img 
          src={displayImage} 
          alt={mode === 'model' ? fabric.name : `${fabric.name} - ${specificColorName}`} 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        
        {/* Overlay subtle gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      </div>

      {/* SECTION INFERIOR (Información) - Takes 25% of the square */}
      <div className="h-[25%] px-3 py-1 text-center flex flex-col items-center justify-center bg-white relative z-20">
        <div className="w-full">
          {mode === 'model' ? (
            /* VISTA MODELOS */
            <>
              <h3 className="font-serif text-lg font-bold text-slate-900 leading-tight mb-0.5 group-hover:text-black transition-colors truncate px-2">
                {fabric.name}
              </h3>
              <p className="text-[10px] text-gray-400 font-medium uppercase leading-tight truncate px-1 tracking-wide">
                {colorList.join(', ')}
              </p>
            </>
          ) : (
            /* VISTA COLORES */
            <>
              <h3 className="font-serif text-base font-bold text-slate-900 leading-none mb-0.5 group-hover:text-black truncate px-2">
                {specificColorName}
              </h3>
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5 truncate">
                {fabric.name}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FabricCard;