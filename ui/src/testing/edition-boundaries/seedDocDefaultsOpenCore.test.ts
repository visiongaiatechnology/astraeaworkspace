import { describe, expect, it } from 'vitest';
import { OPEN_CORE_APP_KINDS, PREMIUM_ONLY_APP_KINDS } from '../../edition/contracts';
import { createNewDocument } from '../../app/bootstrap/seedDocDefaultsOpenCore';

describe('Open Core document factory boundary', () => {
  it('creates a canonical default document for each implemented Open Core app', () => {
    for (const kind of OPEN_CORE_APP_KINDS) {
      const document = createNewDocument(kind);
      expect(document.kind).toBe(kind);
      expect(document.schema_version).toBeTruthy();
      expect(document.id).toMatch(/^doc-\d+$/u);
      expect(document.objects).toBeDefined();
      expect(document.root_object_ids).toBeDefined();
    }
  });

  it('rejects every Premium document kind before returning a payload', () => {
    for (const kind of PREMIUM_ONLY_APP_KINDS) {
      expect(() => createNewDocument(kind)).toThrow('edition.appUnavailable');
    }
  });

  it('does not seed Forms or Database implementation payloads into Open Core documents', () => {
    for (const kind of OPEN_CORE_APP_KINDS) {
      const serialized = JSON.stringify(createNewDocument(kind));
      expect(serialized).not.toContain('formsData');
      expect(serialized).not.toContain('databaseData');
    }
  });
});
