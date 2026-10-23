// STATUS: PLATIN — audience/projector display: the slide only, nothing else.
import React from 'react';
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';
import { presentPresentationCopy } from '../locale/presentPresentationLocale';
import { PresentDisplayStatusPanel } from './PresentDisplayStatusPanel';
import { PresentScaledSlideStage } from './PresentScaledSlideStage';
import type { PresentDisplayRuntime } from './runtime/usePresentDisplayRuntime';

export interface PresentAudienceDisplayProps {
  readonly runtime: PresentDisplayRuntime;
  readonly locale: WorkspaceLocale;
}

export const PresentAudienceDisplay: React.FC<PresentAudienceDisplayProps> = ({ runtime, locale }) => {
  const copy = presentPresentationCopy(locale).display;
  const { state } = runtime;
  const hasDeck = state.presentData !== null && state.slides.length > 0;

  let status: React.ReactNode = null;
  if (state.phase === 'unavailable') {
    status = (
      <PresentDisplayStatusPanel
        role="audience"
        tone="error"
        title={copy.channelUnavailableTitle}
        body={copy.channelUnavailableBody}
      />
    );
  } else if (state.phase === 'connecting') {
    status = (
      <PresentDisplayStatusPanel
        role="audience"
        tone="pending"
        title={copy.connecting}
        body={copy.waitingForEditor}
      />
    );
  } else if (state.phase === 'timeout') {
    status = (
      <PresentDisplayStatusPanel
        role="audience"
        tone="error"
        notice={state.notice}
        title={state.notice === 'editor-lost' ? copy.editorLost : copy.timeoutTitle}
        body={copy.timeoutBody}
        actionLabel={copy.retry}
        onAction={runtime.actions.retryConnection}
      />
    );
  } else if (state.phase === 'ready' && !hasDeck) {
    status = (
      <PresentDisplayStatusPanel
        role="audience"
        tone="pending"
        title={copy.emptyDeckTitle}
        body={copy.emptyDeckBody}
      />
    );
  }

  return (
    <div
      data-present-display-root="audience"
      data-present-display-role="audience"
      data-present-display-phase={state.phase}
      className="fixed inset-0 overflow-hidden bg-black"
    >
      {state.phase === 'ready' && hasDeck && state.presentData && (
        <PresentScaledSlideStage
          slides={state.slides}
          presentData={state.presentData}
          embeddedObjects={state.embeddedObjects}
          currentIdx={state.index}
          transitionState={state.transitionState}
          activeAnimations={state.activeAnimations}
          animationProgressById={state.animationProgressById}
        />
      )}
      {state.blackScreen && (
        <div data-present-black-screen="true" aria-hidden="true" className="absolute inset-0 z-40 bg-black" />
      )}
      {status}
    </div>
  );
};
