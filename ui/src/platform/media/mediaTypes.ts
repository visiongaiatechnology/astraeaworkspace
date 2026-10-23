// STATUS: DIAMANT VGT SUPREME — canonical media/asset contracts
export type MediaKind = 'image'|'svg'|'audio'|'video';
export type MediaStorageMode = 'embedded'|'local-link'|'vault-link'|'space-link'|'remote-link';
export type MediaLinkState = 'embedded'|'ok'|'missing'|'modified'|'blocked'|'unsupported';
export type MediaLibraryScope = 'local'|'vault'|'space';
export type MediaPlatform = 'windows'|'linux'|'macos'|'astraeaos';
export type MediaCodecState = 'available'|'unavailable'|'unknown';

export interface MediaProvenance {
  importedAtMs:number;
  sourceKind:'local'|'vault'|'space'|'remote'|'generated';
  sourceRef?:string;
  decoderId:string;
  decoderVersion?:string;
}
export interface MediaDimensions { widthPx:number; heightPx:number; }
export interface MediaCrop { x:number; y:number; width:number; height:number; }
export interface MediaColorAdjustment { brightness?:number; contrast?:number; saturation?:number; exposure?:number; }
export interface MediaImageOperations {
  crop?:MediaCrop;
  rotateDeg?:0|90|180|270;
  flipX?:boolean;
  flipY?:boolean;
  color?:MediaColorAdjustment;
}
export interface MediaAsset {
  id:string;
  kind:MediaKind;
  mimeType:string;
  byteSize:number;
  sha256:string;
  dimensions?:MediaDimensions;
  durationMs?:number;
  provenance:MediaProvenance;
  storageMode:MediaStorageMode;
  sourceLink?:string;
  linkState:MediaLinkState;
  originalSha256:string;
  imageOperations?:MediaImageOperations;
  posterAssetId?:string;
  metadata?:Readonly<Record<string,string|number|boolean>>;
}

export interface MediaVerificationEvidence {
  authenticityVerified:boolean;
  integrityVerified:boolean;
  decoderVerified:boolean;
  policyAllowed:boolean;
  source:'local-picker'|'vault'|'space'|'signed-package'|'remote-netgate';
}
export interface MediaAssetPayload { asset:MediaAsset; bytes?:Uint8Array; deduplicated:boolean; }
export interface MediaProbe {
  kind:MediaKind;
  mimeType:string;
  byteSize:number;
  dimensions?:MediaDimensions;
  durationMs?:number;
  containerBrand?:string;
  svgSanitized?:string;
}
export interface MediaCodecCapability { codec:string; decode:MediaCodecState; encode:MediaCodecState; reason?:string; }
export interface MediaPlatformCapabilities { platform:MediaPlatform; codecs:MediaCodecCapability[]; frameExtraction:boolean; boundedTranscode:boolean; }
export interface MediaLibraryEntry {
  assetId:string;
  scope:MediaLibraryScope;
  tags:string[];
  favorite:boolean;
  usageRefs:string[];
  brand?:{ brandId:string; version:number; mode:'live'|'frozen'; };
}
export interface MediaLibrary { entries:MediaLibraryEntry[]; }
export interface MediaReplacementPreview { sourceAssetId:string; replacementAssetId:string; affectedUsageRefs:string[]; liveBrandRefs:string[]; frozenBrandRefs:string[]; requiresConfirmation:true; }
export interface MediaBoundaryLimits {
  maxBytes:number;
  maxDimensionPx:number;
  maxPixels:number;
  maxEstimatedDecodedBytes:number;
  maxSvgElements:number;
  maxSvgDepth:number;
  maxMetadataBytes:number;
  maxDurationMs:number;
}
