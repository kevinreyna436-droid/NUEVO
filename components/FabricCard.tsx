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
      // Added stronger hover scale and lift (translate-y-2) for more interaction
      className="group relative w-full aspect-square bg-white rounded-3xl shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden cursor-pointer flex flex-col hover:-translate-y-2 hover:scale-[1.02]"
    >
      {/* SECTION SUPERIOR (Imagen) - Increased to 70% (approx 10% increase from 60%) */}
      <div className="relative h-[70%] w-full bg-gray-100 overflow-hidden">
        {/* Image */}
        <img 
          src={displayImage} 
          alt={mode === 'model' ? fabric.name : `${fabric.name} - ${specificColorName}`} 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        
        {/* Overlay subtle gradient + View Icon on Hover */}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <div className="bg-white/20 backdrop-blur-md p-3 rounded-full transform scale-75 group-hover:scale-100 transition-transform duration-500 border border-white/30">
                <svg className="w-8 h-8 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            </div>
        </div>
      </div>

      {/* SECTION INFERIOR (Información) - Reduced to 30% */}
      <div className="h-[30%] px-4 pb-2 pt-2 text-center flex flex-col items-center justify-center bg-white relative z-20">
        <div className="w-full flex flex-col justify-center h-full space-y-1">
          {mode === 'model' ? (
            /* VISTA MODELOS */
            <>
              <h3 className="font-serif text-2xl md:text-3xl font-bold text-slate-900 leading-tight mb-1 group-hover:text-black transition-colors px-1 line-clamp-1">
                {fabric.name}
              </h3>
              {/* Added Supplier Name */}
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