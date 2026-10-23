// STATUS: PLATIN
export const WHITEBOARD_GUEST_PROVIDER_UNAVAILABLE = 'whiteboard_guest_provider_unavailable';

/** No authenticated, document-scoped guest issuer is installed in this workspace. */
export function createWhiteboardSecureGuestLink(): never {
  throw new Error(WHITEBOARD_GUEST_PROVIDER_UNAVAILABLE);
}
