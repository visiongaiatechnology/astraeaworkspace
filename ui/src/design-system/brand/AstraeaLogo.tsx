import React from 'react';
import { AstraeaAppIcon } from './AstraeaAppIcon';

export interface AstraeaLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  glow?: boolean;
  withText?: boolean;
  subtitle?: string;
}

const SIZE_MAP: Record<string, { img: string; text: string; sub: string }> = {
  xs: { img: 'w-6 h-6', text: 'text-xs', sub: 'text-[9px]' },
  sm: { img: 'w-8 h-8', text: 'text-sm', sub: 'text-[10px]' },
  md: { img: 'w-10 h-10', text: 'text-base', sub: 'text-xs' },
  lg: { img: 'w-12 h-12', text: 'text-lg', sub: 'text-xs' },
  xl: { img: 'w-16 h-16', text: 'text-xl', sub: 'text-sm' },
};

export const AstraeaLogo: React.FC<AstraeaLogoProps> = ({
  size = 'md',
  className = '',
  glow = false,
  withText = false,
  subtitle,
}) => {
  const currentSize = SIZE_MAP[size] || SIZE_MAP.md;

  const logoImage = (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${currentSize.img} ${className}`}
    >
      <AstraeaAppIcon
        kind="Workspace"
        alt="Official Astraea Workspace logo"
        glow={glow}
        className="w-full h-full transition-transform duration-300 hover:scale-105"
      />
    </div>
  );

  if (!withText) {
    return logoImage;
  }

  return (
    <div className="flex items-center space-x-3 select-none">
      {logoImage}
      <div className="flex flex-col">
        <div className="flex items-center space-x-2">
          <span className={`font-bold tracking-tight text-white ${currentSize.text}`}>
            Astraea Workspace
          </span>
          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
            SOVEREIGN
          </span>
        </div>
        {subtitle && (
          <span className={`text-slate-400 font-normal ${currentSize.sub}`}>
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
};

export default AstraeaLogo;
