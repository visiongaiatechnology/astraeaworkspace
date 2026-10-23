// STATUS: PLATIN — narrow, injectable facade over the native Present display bridge.
//
// `ui/src/platform/native/presentWindowBridge.ts` is owned by the native integration and already
// degrades to `[]`/`null` outside Tauri. This facade exists so the editor session controller can be
// driven by a fake in logic tests without mocking a platform module, and so there is exactly one
// place that knows the bridge function names.
import {
  closePresentDisplay,
  createPresentSessionId,
  listPresentMonitors,
  openPresentDisplay,
  presentDisplayAvailable,
  type PresentDisplayHandle,
  type PresentDisplayRole as BridgePresentDisplayRole,
  type PresentMonitorInfo,
} from '../../../../platform/native/presentWindowBridge';
import type { PresentDisplayRole } from '../session/presentSessionProtocol';

export interface PresentDisplayBridge {
  available(): boolean;
  createSessionId(): string;
  listMonitors(): Promise<PresentMonitorInfo[]>;
  open(role: PresentDisplayRole, monitorIndex: number, session: string): Promise<PresentDisplayHandle | null>;
  close(role: PresentDisplayRole): Promise<void>;
}

/** The bridge roles and the session roles name the same two literal values. */
const toBridgeRole = (role: PresentDisplayRole): BridgePresentDisplayRole => role;

export const nativePresentDisplayBridge: PresentDisplayBridge = {
  available: presentDisplayAvailable,
  createSessionId: createPresentSessionId,
  listMonitors: listPresentMonitors,
  open: (role, monitorIndex, session) => openPresentDisplay(toBridgeRole(role), monitorIndex, session),
  close: (role) => closePresentDisplay(toBridgeRole(role)),
};
