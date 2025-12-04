import React from 'react';
import { Fabric } from '../types';

interface FabricCardProps {
  fabric: Fabric;
  onClick: () => void;
  mode: 'model' | 'color';
  specificColorName?: string;
  index: number;
}

const FabricCard: React.FC<FabricCardProps> = ({ fabric, onClick, mode, specificColorName, index }) => {
  // Determine which image to show
  let displayImage = fabric.mainImage;
  if (mode === 'color' && specificColorName && fabric.colorImages?.[specificColorName]) {
    displayImage = fabric.colorImages[specificColorName];
  }

  // Alternating wave effect based on index
  const isOdd = index % 2 !== 0;

  // Safe access to colors
  const colorList = fabric.colors || [];

  return (
    <div 
      onClick={onClick}
      // Removed fixed width (w-48 -> w-full), removed rounded corners (rounded-none), removed border/shadow for seamless look
      className="group relative w-full h-64 bg-white overflow-hidden cursor-pointer transition-all duration-500 hover:z-10 hover:shadow-2xl flex flex-col"
    >
      {/* SECTION SUPERIOR (Imagen Grande) */}
      <div className="relative h-48 w-full bg-gray-100 overflow-hidden flex-shrink-0">
        
        {/* Image */}
        <img 
          src={displayImage} 
          alt={mode === 'model' ? fabric.name : `${fabric.name} - ${specificColorName}`} 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />

        {/* Wave Overlay (SVG) at the bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-8 w-full z-10 text-white">
           {isOdd ? (
             // Concave Up (Bulge Up) - The white part forms a hill
             <svg viewBox="0 0 1440 320" preserveAspectRatio="none" className="w-full h-full">
                <path fill="currentColor" fillOpacity="1" d="M0,320L1440,320L1440,160C1100,280 340,40 0,160Z"></path>
             </svg>
           ) : (
             // Concave Down (Scoop) - The white part forms a valley
             <svg viewBox="0 0 1440 320" preserveAspectRatio="none" className="w-full h-full">
                 <path fill="currentColor" fillOpacity="1" d="M0,320L1440,320L1440,0C1100,120 340,280 0,160Z"></path>
             </svg>
           )}
        </div>
      </div>

      {/* SECTION INFERIOR (Información Compacta) */}
      <div className="flex-1 px-3 py-2 text-center flex flex-col items-center justify-start bg-white relative z-20">
        <div className="w-full">
          {mode === 'model' ? (
            /* VISTA MODELOS */
            <>
              <h3 className="font-serif text-lg font-bold text-slate-900 leading-none mb-1">
                {fabric.name}
              </h3>
              <p className="text-[9px] text-gray-400 font-medium uppercase leading-tight line-clamp-1 px-1">
                {colorList.join(', ')}
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

        {/* Proveedor Compacto */}
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