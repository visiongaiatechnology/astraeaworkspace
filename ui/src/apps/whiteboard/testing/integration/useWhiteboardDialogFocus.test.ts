// STATUS: PLATIN
import { describe, expect, it } from 'vitest';
import { attachWhiteboardDialogFocus } from '../../integrations/useWhiteboardDialogFocus';

type HarnessStyle = Pick<CSSStyleDeclaration, 'display' | 'visibility'>;

interface ElementOptions {
  tabIndex?: number;
  attributes?: Readonly<Record<string, string>>;
  style?: Partial<HarnessStyle>;
  parent?: FocusHarnessElement;
}

class DocumentHarness {
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  activeElement: HTMLElement | null = null;
  readonly reference: Document;

  constructor() {
    const harness = this;
    this.reference = {
      get activeElement() {
        return harness.activeElement;
      },
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        const listeners = harness.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
        listeners.add(listener);
        harness.listeners.set(type, listeners);
      },
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        harness.listeners.get(type)?.delete(listener);
      },
      defaultView: {
        getComputedStyle(element: Element) {
          return (element as unknown as FocusHarnessElement).style as CSSStyleDeclaration;
        },
      },
    } as unknown as Document;
  }

  dispatch(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    }
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

class FocusHarnessElement {
  readonly style: HarnessStyle;
  readonly element: HTMLElement;
  readonly attributes: Map<string, string>;
  readonly parent: FocusHarnessElement | null;
  readonly tabIndex: number;
  descendants: FocusHarnessElement[] = [];

  constructor(documentHarness: DocumentHarness, options: ElementOptions = {}) {
    this.attributes = new Map(Object.entries(options.attributes ?? {}));
    this.parent = options.parent ?? null;
    this.tabIndex = options.tabIndex ?? 0;
    this.style = {
      display: options.style?.display ?? 'block',
      visibility: options.style?.visibility ?? 'visible',
    };

    const harnessElement = this;
    this.element = {
      get tabIndex() {
        return harnessElement.tabIndex;
      },
      get parentElement() {
        return harnessElement.parent?.element ?? null;
      },
      get ownerDocument() {
        return documentHarness.reference;
      },
      hasAttribute(name: string) {
        return harnessElement.attributes.has(name);
      },
      getAttribute(name: string) {
        return harnessElement.attributes.get(name) ?? null;
      },
      matches(selector: string) {
        return selector === ':disabled' && harnessElement.attributes.has('disabled');
      },
      querySelectorAll() {
        return harnessElement.descendants.map((descendant) => descendant.element);
      },
      contains(target: Node) {
        let current = target as unknown as HTMLElement | null;
        while (current) {
          if (current === harnessElement.element) return true;
          current = current.parentElement;
        }
        return false;
      },
      focus() {
        documentHarness.activeElement = harnessElement.element;
      },
    } as unknown as HTMLElement;
  }
}

function fireKeydown(documentHarness: DocumentHarness, key: string, shiftKey = false): boolean {
  let prevented = false;
  const event = {
    key,
    shiftKey,
    preventDefault() {
      prevented = true;
    },
  } as unknown as KeyboardEvent;
  documentHarness.dispatch('keydown', event);
  return prevented;
}

describe('Whiteboard dialog focus management', () => {
  it('uses the latest close callback without reinstalling document listeners', () => {
    const documentHarness = new DocumentHarness();
    const dialog = new FocusHarnessElement(documentHarness, { tabIndex: -1 });
    let closeCount = 0;
    let currentClose = () => {
      closeCount += 1;
    };
    const detach = attachWhiteboardDialogFocus(documentHarness.reference, dialog.element, () => currentClose());

    currentClose = () => {
      closeCount += 10;
    };

    expect(documentHarness.listenerCount('keydown')).toBe(1);
    expect(fireKeydown(documentHarness, 'Escape')).toBe(true);
    expect(closeCount).toBe(10);

    detach();
    expect(documentHarness.listenerCount('keydown')).toBe(0);
    expect(documentHarness.listenerCount('focusin')).toBe(0);
  });

  it('wraps forward and reverse tab navigation at the dialog boundaries', () => {
    const documentHarness = new DocumentHarness();
    const dialog = new FocusHarnessElement(documentHarness, { tabIndex: -1 });
    const first = new FocusHarnessElement(documentHarness);
    const last = new FocusHarnessElement(documentHarness);
    dialog.descendants = [first, last];
    const detach = attachWhiteboardDialogFocus(documentHarness.reference, dialog.element, () => undefined);

    documentHarness.activeElement = last.element;
    expect(fireKeydown(documentHarness, 'Tab')).toBe(true);
    expect(documentHarness.activeElement).toBe(first.element);

    documentHarness.activeElement = first.element;
    expect(fireKeydown(documentHarness, 'Tab', true)).toBe(true);
    expect(documentHarness.activeElement).toBe(last.element);

    detach();
  });

  it('excludes hidden ancestors and negative tab stops, then recaptures escaped focus', () => {
    const documentHarness = new DocumentHarness();
    const dialog = new FocusHarnessElement(documentHarness, { tabIndex: -1 });
    const hiddenContainer = new FocusHarnessElement(documentHarness, { attributes: { 'aria-hidden': 'true' } });
    const hiddenControl = new FocusHarnessElement(documentHarness, { parent: hiddenContainer });
    const negativeTabStop = new FocusHarnessElement(documentHarness, { tabIndex: -2 });
    const visibleControl = new FocusHarnessElement(documentHarness);
    const outside = new FocusHarnessElement(documentHarness);
    dialog.descendants = [hiddenControl, negativeTabStop, visibleControl];
    const detach = attachWhiteboardDialogFocus(documentHarness.reference, dialog.element, () => undefined);

    documentHarness.activeElement = outside.element;
    const focusEvent = { target: outside.element } as unknown as FocusEvent;
    documentHarness.dispatch('focusin', focusEvent as unknown as Event);
    expect(documentHarness.activeElement).toBe(visibleControl.element);

    documentHarness.activeElement = outside.element;
    expect(fireKeydown(documentHarness, 'Tab')).toBe(true);
    expect(documentHarness.activeElement).toBe(visibleControl.element);

    detach();
  });

  it('keeps focus on the dialog when there are no sequential focus targets', () => {
    const documentHarness = new DocumentHarness();
    const dialog = new FocusHarnessElement(documentHarness, { tabIndex: -1 });
    dialog.descendants = [new FocusHarnessElement(documentHarness, { tabIndex: -1 })];
    const detach = attachWhiteboardDialogFocus(documentHarness.reference, dialog.element, () => undefined);

    expect(fireKeydown(documentHarness, 'Tab')).toBe(true);
    expect(documentHarness.activeElement).toBe(dialog.element);

    detach();
  });
});
