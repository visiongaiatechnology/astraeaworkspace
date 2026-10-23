// STATUS: PLATIN — root of the shell-less Present display window.
//
// The window renders exactly one of the two display roles. It resolves its locale from the stored
// Workspace preference (the shell provider is not mounted here) and owns the reduced-motion decision
// for the whole display runtime.
import React, { useEffect, useMemo } from 'react';
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';
import { presentPresentationCopy } from '../locale/presentPresentationLocale';
import type { PresentDisplayRole } from '../session/presentSessionProtocol';
import type { PresentChannelFactory } from '../session/presentSessionBus';
import { PresentAudienceDisplay } from './PresentAudienceDisplay';
import { PresentPresenterDisplay } from './PresentPresenterDisplay';
import { resolvePresentDisplayLocale } from './presentDisplayLocale';
import { usePresentDisplayRuntime } from './runtime/usePresentDisplayRuntime';
import { usePrefersReducedMotion } from './runtime/usePrefersReducedMotion';

export interface PresentDisplayAppProps {
  readonly role: PresentDisplayRole;
  readonly session: string;
  readonly locale?: WorkspaceLocale;
  readonly channelFactory?: PresentChannelFactory;
  /** Test override for the OS reduced-motion preference. */
  readonly reducedMotionOverride?: boolean;
}

export const PresentDisplayApp: React.FC<PresentDisplayAppProps> = ({
  role,
  session,
  locale,
  channelFactory,
  reducedMotionOverride,
}) => {
  const prefersReducedMotion = usePrefersReducedMotion();
  const reducedMotion = reducedMotionOverride ?? prefersReducedMotion;
  const resolvedLocale = useMemo<WorkspaceLocale>(() => locale ?? resolvePresentDisplayLocale(), [locale]);
  const runtime = usePresentDisplayRuntime({ role, session, reducedMotion, channelFactory });
  const copy = presentPresentationCopy(resolvedLocale).display;

  useEffect(() => {
    document.title = role === 'presenter' ? copy.presenterWindowLabel : copy.audienceWindowLabel;
  }, [copy, role]);

  return role === 'audience'
    ? <PresentAudienceDisplay runtime={runtime} locale={resolvedLocale} />
    : <PresentPresenterDisplay runtime={runtime} locale={resolvedLocale} />;
};
