// STATUS: PLATIN — owns accessible, bounded workspace notifications and security warning subscriptions.
import { useCallback, useEffect, useRef, useState } from 'react';
import { RICH_TEXT_SECURITY_WARNING_EVENT } from '../platform/security/richTextLinkSecurity';
import { WORKSPACE_SECURITY_DROP_REJECT_EVENT } from '../platform/security/security';

export function useWorkspaceAppNotifications() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const toastDismissAtRef = useRef(0);
  const toastRemainingRef = useRef(4_000);

  const armToastDismiss = useCallback((delayMs: number) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    const bounded = Math.max(1, Math.min(4_000, Math.round(delayMs)));
    toastRemainingRef.current = bounded;
    toastDismissAtRef.current = performance.now() + bounded;
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToastVisible(false);
      window.setTimeout(() => setToastMessage(null), 200);
    }, bounded);
  }, []);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    armToastDismiss(4_000);
  }, [armToastDismiss]);

  const pauseToastDismiss = useCallback(() => {
    if (toastTimerRef.current === null) return;
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
    toastRemainingRef.current = Math.max(1, toastDismissAtRef.current - performance.now());
  }, []);

  const resumeToastDismiss = useCallback(() => {
    if (toastMessage) armToastDismiss(toastRemainingRef.current);
  }, [armToastDismiss, toastMessage]);

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    const handleSecurityWarning = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      showToast(detail || 'Security warning: dropped file was rejected.');
    };
    window.addEventListener(WORKSPACE_SECURITY_DROP_REJECT_EVENT, handleSecurityWarning);
    window.addEventListener(RICH_TEXT_SECURITY_WARNING_EVENT, handleSecurityWarning);
    return () => {
      window.removeEventListener(WORKSPACE_SECURITY_DROP_REJECT_EVENT, handleSecurityWarning);
      window.removeEventListener(RICH_TEXT_SECURITY_WARNING_EVENT, handleSecurityWarning);
    };
  }, [showToast]);

  return { toastMessage, toastVisible, showToast, pauseToastDismiss, resumeToastDismiss };
}
