import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';
import { GRID_MONTE_CARLO_TEMPLATES } from '../../analysis/gridMonteCarlo';
import { GridMonteCarloErrorMessage, GridMonteCarloModal } from '../../analysis/GridMonteCarloModal';
import { GridSolverErrorMessage, GridSolverModal } from '../../analysis/GridSolverModal';
import { GRID_MONTE_CARLO_COPY, gridMonteCarloFailureCopy } from '../gridMonteCarloLocale';
import { GRID_SOLVER_COPY, gridSolverFailureCopy } from '../gridSolverLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const locales = WORKSPACE_LOCALES as readonly WorkspaceLocale[];

describe('Grid analysis dialogs localization', () => {
  it('renders Solver controls, accessible names, and narrow-layout guards in all locales', () => {
    for (const locale of locales) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = GRID_SOLVER_COPY[locale];
      const markup = renderToStaticMarkup(<GridSolverModal isOpen onClose={noop} onApplySolution={() => true} selectedCell="H7" />);

      for (const label of [copy.title('H7'), copy.close, copy.modes.linear, copy.modes.integer, copy.modes.nonlinear, copy.decisionCells, copy.objectiveExpression, copy.goal, copy.maximize, copy.minimize, copy.bounds, copy.minimum('A1'), copy.maximum('A1'), copy.constraints(2), copy.addConstraint, copy.constraintExpression(1), copy.constraintOperator(1), copy.constraintValue(1), copy.deleteConstraint(1), copy.run, copy.apply]) {
        expect(markup, `${locale}: ${label}`).toContain(label);
      }
      expect(markup).toContain('role="dialog"');
      expect(markup).toContain('aria-modal="true"');
      expect(markup).toContain('max-h-[92vh]');
      expect(markup).toContain('grid-cols-1 sm:grid-cols-3');
      expect(markup).toContain('grid-cols-1 sm:grid-cols-[minmax(0,1fr)_70px_110px_32px]');
      expect(markup).toContain('value="40*A1 + 30*B1"');
      expect(markup).toContain('value="2*A1 + 3*B1"');
    }
  });

  it('renders safe localized Solver error alerts and maps diagnostic tokens to user copy', () => {
    for (const locale of locales) {
      const copy = GRID_SOLVER_COPY[locale];
      const message = gridSolverFailureCopy(locale, new Error('solver_linear_expression_invalid'));
      const markup = renderToStaticMarkup(<GridSolverErrorMessage message={message} />);
      expect(message).toBe(copy.errors.expression);
      expect(markup).toContain('role="alert"');
      expect(markup).toContain('break-words');
      expect(markup).toContain(message);
      expect(gridSolverFailureCopy(locale, new Error('private engine path'))).toBe(copy.errors.generic);
      expect(gridSolverFailureCopy(locale, new Error('solver_bounds_invalid'))).toBe(copy.errors.bounds);
      expect(gridSolverFailureCopy(locale, undefined, 'apply')).toBe(copy.errors.notApplied);
      expect(gridSolverFailureCopy(locale, undefined, 'commit')).toBe(copy.errors.commitFailed);
    }
  });

  it('renders Monte Carlo labels, template names, authored formula data, and responsive variable controls', () => {
    const expectedTemplateKeys = GRID_MONTE_CARLO_TEMPLATES.map(({ id }) => id).sort();
    for (const locale of locales) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = GRID_MONTE_CARLO_COPY[locale];
      expect(Object.keys(copy.templates).sort(), `${locale} template coverage`).toEqual(expectedTemplateKeys);
      expect(Object.keys(copy.distributions).sort(), `${locale} distributions`).toEqual(['lognormal', 'normal', 'triangular', 'uniform']);
      const markup = renderToStaticMarkup(<GridMonteCarloModal isOpen onClose={noop} selectedCell="H7" />);

      for (const label of [copy.title('H7'), copy.close, copy.objective, copy.iterations, copy.seed, copy.variables(2), copy.addVariable, copy.variableName(1), copy.distribution(1), copy.distributions.normal, copy.distributions.uniform, copy.distributions.triangular, copy.distributions.lognormal, copy.parameterOne('Umsatz'), copy.parameterTwo('Umsatz'), copy.removeVariable('Umsatz'), copy.run, copy.templates['margin-risk'], copy.templates['project-cost']]) {
        expect(markup, `${locale}: ${label}`).toContain(label);
      }
      expect(markup).toContain('role="dialog"');
      expect(markup).toContain('aria-modal="true"');
      expect(markup).toContain('max-h-[92vh]');
      expect(markup).toContain('grid-cols-1 md:grid-cols-2');
      expect(markup).toContain('sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(4rem,5rem)_minmax(4rem,5rem)_auto]');
      expect(markup).toContain('Umsatz - Kosten');
      expect(markup).toContain('value="Umsatz"');
    }
  });

  it('renders Monte Carlo generic and validated failure alerts in all locales', () => {
    for (const locale of locales) {
      const copy = GRID_MONTE_CARLO_COPY[locale];
      const unknown = gridMonteCarloFailureCopy(locale, new Error('private simulation stack path'));
      const markup = renderToStaticMarkup(<GridMonteCarloErrorMessage message={unknown} />);
      expect(unknown).toBe(copy.genericFailure);
      expect(markup).toContain('role="alert"');
      expect(markup).toContain('break-words');
      expect(markup).toContain(copy.genericFailure);
      expect(gridMonteCarloFailureCopy(locale, new Error('monte_carlo_stddev_invalid'))).toBe(copy.standardDeviationInvalid);
      expect(gridMonteCarloFailureCopy(locale, new Error('monte_carlo_triangular_invalid'))).toBe(copy.triangularInvalid);
      expect(markup).not.toContain('private simulation stack path');
    }
  });
});
