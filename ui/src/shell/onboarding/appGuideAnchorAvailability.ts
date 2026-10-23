// STATUS: GOLD — prevents progression through an unavailable or inaccessible guide target.

export interface AppGuideAnchorAvailability {
  readonly hasLayout: boolean;
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly exposed: boolean;
}

/** Checks whether the anchored UI can be used; it does not verify that the guide action was completed. */
export function isAppGuideAnchorAvailable(state: AppGuideAnchorAvailability): boolean {
  return state.hasLayout && state.visible && state.enabled && state.exposed;
}
