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
      // Hover scale and lift (translate-y-2) for interaction
      className="group relative w-full aspect-square bg-white rounded-3xl shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden cursor-pointer flex flex-col hover:-translate-y-2 hover:scale-[1.02]"
    >
      {/* SECTION SUPERIOR (Imagen) - 60% height to ensure text has space */}
      <div className="relative h-[60%] w-full bg-gray-100 overflow-hidden">
        {/* Image */}
        <img 
          src={displayImage} 
          alt={mode === 'model' ? fabric.name : `${fabric.name} - ${specificColorName}`} 
          className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-110"
        />
        
        {/* Removed the Eye/View Icon Overlay as requested */}
      </div>

      {/* SECTION INFERIOR (Información) - 40% height */}
      <div className="h-[40%] px-4 pb-2 pt-2 text-center flex flex-col items-center justify-center bg-white relative z-20">
        <div className="w-full flex flex-col justify-center h-full space-y-1">
          {mode === 'model' ? (
            /* VISTA MODELOS */
            <>
              <h3 className="font-serif text-2xl md:text-3xl font-bold text-slate-900 leading-tight mb-1 group-hover:text-black transition-colors px-1 line-clamp-1">
                {fabric.name}
              </h3>
              {/* Supplier Name */}
              <p className="text-xs md:text-sm font-bold text-gray-400 uppercase tracking-widest mb-1 leading-none">
                {fabric.supplier}
              </p>
              
              <div className="w-12 h-[1px] bg-gray-200 mx-auto my-1"></div>
              
              <p className="text-[10px] md:text-xs text-gray-500 font-medium uppercase leading-snug px-1 tracking-wide line-clamp-2">
                {colorList.join(', ')}
              </p>
            </>
          ) : (
            /* VISTA COLORES */
            <>
              <h3 className="font-serif text-xl md:text-2xl font-bold text-slate-900 leading-none mb-1 group-hover:text-black line-clamp-1 px-1">
                {specificColorName}
              </h3>
               <div className="w-8 h-[1px] bg-gray-200 mx-auto my-1"></div>
              
              {/* Fabric Name + Supplier */}
              <p className="text-xs md:text-sm text-gray-500 font-bold uppercase tracking-widest mt-0.5 line-clamp-1">
                {fabric.name}
              </p>
               <p className="text-[10px] md:text-xs text-gray-300 font-bold uppercase tracking-widest leading-none">
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