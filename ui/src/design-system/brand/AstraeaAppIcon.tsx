// STATUS: DIAMANT VGT SUPREME — Canonical Astraea application icon registry
import React from 'react';
import { ShieldCheck } from 'lucide-react';
import type { DocumentKind } from '../../shared/contracts/workspace';
import './AstraeaAppIcon.css';

export type AstraeaAppIconKind = DocumentKind | 'Workspace';

const ICON_PATH_BY_KIND: Partial<Record<AstraeaAppIconKind, string>> = {
  Workspace: '/branding/astraea-workspace-official.png',
  Writer: '/astraea-icons/svg/astraea-writer.svg',
  Grid: '/astraea-icons/svg/astraea-grid.svg',
  Present: '/astraea-icons/svg/astraea-present.svg',
  Notes: '/astraea-icons/svg/astraea-notes.svg',
  PdfStudio: '/astraea-icons/svg/astraea-pdf-studio.svg',
  Publish: '/branding/astraea-publisher-official.png',
  Insight: '/branding/astraea-insight-official.png',
  Connect: '/branding/astraea-connect-official.png',
  Automate: '/branding/astraea-automate-official.png',
  Tasks: '/astraea-icons/svg/astraea-tasks.svg',
  Planner: '/astraea-icons/svg/astraea-planner.svg',
  Projects: '/astraea-icons/svg/astraea-projects.svg',
  Whiteboard: '/astraea-icons/svg/astraea-whiteboard.svg',
  Draw: '/astraea-icons/svg/astraea-draw.svg',
  Forms: '/astraea-icons/svg/astraea-forms.svg',
  Database: '/astraea-icons/svg/astraea-database.svg',
  Vault: '/astraea-icons/svg/astraea-vault.svg',
  Spaces: '/astraea-icons/svg/astraea-spaces.svg',
  GaiaCom: '/astraea-icons/svg/astraea-gaiacom.svg',
};

export function getAstraeaAppIconSrc(kind: AstraeaAppIconKind): string | undefined {
  return ICON_PATH_BY_KIND[kind];
}

export function hasAstraeaAppIcon(kind: AstraeaAppIconKind): boolean {
  return kind === 'AdminPolicy' || Boolean(getAstraeaAppIconSrc(kind));
}

export interface AstraeaAppIconProps {
  kind: AstraeaAppIconKind;
  className?: string;
  alt?: string;
  glow?: boolean;
  loading?: 'eager' | 'lazy';
}

export const AstraeaAppIcon: React.FC<AstraeaAppIconProps> = ({
  kind,
  className = '',
  alt = '',
  glow = false,
  loading = 'eager',
}) => {
  if (kind === 'AdminPolicy') {
    return (
      <ShieldCheck
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={!alt}
        className={`select-none ${glow ? 'drop-shadow-[0_4px_10px_rgba(76,29,149,0.22)]' : ''} ${className}`}
      />
    );
  }

  const src = getAstraeaAppIconSrc(kind);
  if (!src) return null;
  const workspaceClass = kind === 'Workspace' ? 'astraea-workspace-mark' : '';
  const glowClass = glow ? 'astraea-app-icon--glow drop-shadow-[0_4px_10px_rgba(76,29,149,0.22)]' : '';

  return (
    <img
      src={src}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      draggable={false}
      loading={loading}
      className={`select-none object-contain ${workspaceClass} ${glowClass} ${className}`}
    />
  );
};

export default AstraeaAppIcon;
