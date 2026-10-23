import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_LOCALES } from '../../localization/workspaceLocaleTypes';
import { WorkspaceGuide, workspaceGuideButtonLabel, type WorkspaceGuideAction } from '../WorkspaceGuide';

const actions: readonly WorkspaceGuideAction[] = [
  'create-writer',
  'show-recent',
  'open-explorer',
  'show-templates',
  'show-recovery',
];

describe('Workspace guide', () => {
  it('provides localized entry and close labels for every supported Workspace locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      expect(workspaceGuideButtonLabel(locale, false).trim().length).toBeGreaterThan(0);
      expect(workspaceGuideButtonLabel(locale, true).trim().length).toBeGreaterThan(0);
    }
  });

  it('renders every actionable guide step with accessible progress and navigation', () => {
    for (const [stepIndex, expectedAction] of actions.entries()) {
      const markup = renderToStaticMarkup(
        <WorkspaceGuide
          locale="en-US"
          stepIndex={stepIndex}
          onStepChange={() => undefined}
          onRunAction={() => undefined}
          onClose={() => undefined}
        />,
      );

      expect(markup).toContain(`Step ${stepIndex + 1} / ${actions.length}`);
      expect(markup).toContain('aria-live="polite"');
      expect(markup).toContain('aria-current="step"');
      expect(markup).toContain(stepIndex === 0 ? 'disabled=""' : 'Back');
      expect(markup).toContain('vgt-button-primary');
      expect(markup).toContain(expectedAction);
    }
  });

  it('renders the final step with an explicit completion action', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceGuide
        locale="de-DE"
        stepIndex={actions.length - 1}
        onStepChange={() => undefined}
        onRunAction={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('Rundgang beenden');
    expect(markup).toContain('Recovery anzeigen');
    expect(markup).not.toContain('Weiter');
  });
});
