
import React, { memo, useState, useRef } from 'react';
import { Fabric } from '../types';
import { IN_STOCK_DB } from '../constants';
import { compressImage } from '../utils/imageCompression';

interface FabricCardProps {
  fabric: Fabric;
  onClick: () => void;
  onDetail: () => void;
  onQuickView: (img: string) => void;
  onVisualize: () => void;
  onUpdate?: (updated: Fabric) => void; // Added for direct upload
  mode: 'model' | 'color';
  specificColorName?: string;
  index: number;
}

const FabricCard: React.FC<FabricCardProps> = ({ fabric, onClick, onDetail, onQuickView, onVisualize, onUpdate, mode, specificColorName }) => {
  const [imgError, setImgError] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  let displayImage = fabric.mainImage;
  if (mode === 'color' && specificColorName && fabric.colorImages?.[specificColorName]) {
    displayImage = fabric.colorImages[specificColorName];
  }

  const toSentenceCase = (str: string) => str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';

  const isVerifiedStock = (): boolean => {
      const modelKey = Object.keys(IN_STOCK_DB).find(k => k.toLowerCase() === fabric.name.toLowerCase());
      if (!modelKey) return false;
      if (mode === 'model') return true;
      if (mode === 'color' && specificColorName) {
          return IN_STOCK_DB[modelKey].some(c => c.toLowerCase() === specificColorName.toLowerCase());
      }
      return false;
  };

  const handleUploadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onUpdate) {
        setIsUploading(true);
        try {
            const base64 = await compressImage(e.target.files[0], 2048, 0.9);
            const updatedFabric = { ...fabric };
            
            if (mode === 'model') {
                updatedFabric.mainImage = base64;
            } else if (mode === 'color' && specificColorName) {
                updatedFabric.colorImages = { ...fabric.colorImages, [specificColorName]: base64 };
            }
            
            onUpdate(updatedFabric);
            setImgError(false);
        } catch (err) {
            console.error("Error uploading image:", err);
        } finally {
            setIsUploading(false);
        }
    }
  };

  return (
    <div 
      onClick={mode === 'color' ? () => onQuickView(displayImage) : onClick}
      className="group relative w-full aspect-[3/4] md:aspect-[4/5] bg-white rounded-3xl shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden cursor-pointer flex flex-col hover:-translate-y-2 transform-gpu"
    >
      <div className="relative h-[70%] w-full bg-gray-100 overflow-hidden">
        {displayImage && !imgError ? (
          <img 
            src={displayImage} 
            alt={fabric.name} 
            onError={() => setImgError(true)}
            className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 group-hover:bg-gray-100 transition-colors">
            {isUploading ? (
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            ) : (
                <div 
                    onClick={handleUploadClick}
                    className="flex flex-col items-center group/btn"
                >
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100 group-hover/btn:border-blue-500 group-hover/btn:scale-110 transition-all mb-2">
                        <svg className="w-6 h-6 text-gray-300 group-hover/btn:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold group-hover/btn:text-blue-500">Subir Foto</span>
                </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
        )}
        
        {isVerifiedStock() && (
            <div className="absolute bottom-3 right-3 z-30 w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow-sm"></div>
        )}

        <div className="absolute bottom-[-1px] left-0 w-full text-white pointer-events-none z-10">
             <svg viewBox="0 0 1440 120" className="w-full h-auto block fill-current" preserveAspectRatio="none">
               <path d="M0,60 C480,130 960,130 1440,60 L1440,120 L0,120 Z" />
             </svg>
        </div>
      </div>

      <div className="h-[30%] px-4 pb-2 text-center flex flex-col items-center justify-center bg-white relative z-20">
          <h3 className="font-serif text-lg md:text-xl font-medium text-slate-800 leading-tight mb-1 line-clamp-1">
            {toSentenceCase(mode === 'model' ? fabric.name : specificColorName || '')}
          </h3>
          <p className="text-[10px] md:text-xs font-semibold text-gray-400 uppercase tracking-widest">
            {mode === 'model' ? fabric.supplier : toSentenceCase(fabric.name)}
          </p>
      </div>
    </div>
  );
};

export default memo(FabricCard);
