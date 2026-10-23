// STATUS: PLATIN — directly verifies the edition-neutral factory's Open Core fail-closed behavior.
import { describe, expect, it } from 'vitest';
import { OPEN_CORE_APP_KINDS, PREMIUM_ONLY_APP_KINDS } from '../../edition/contracts';
import { createNewDocument } from '../../app/bootstrap/seedDocDefaultsOpenCore';

describe('edition-neutral document factory', () => {
  it('creates canonical documents for every Open Core app kind', () => {
    for (const kind of OPEN_CORE_APP_KINDS) {
      const document = createNewDocument(kind);
      expect(document.kind).toBe(kind);
      expect(document.schema_version).toBeTruthy();
      expect(document.objects).toBeDefined();
      expect(document.root_object_ids).toBeDefined();
    }
  });

  it('fails closed for every Premium-only kind in the Open Core test runtime', () => {
    for (const kind of PREMIUM_ONLY_APP_KINDS) {
      expect(() => createNewDocument(kind)).toThrow('edition.appUnavailable');
    }
  });
});
