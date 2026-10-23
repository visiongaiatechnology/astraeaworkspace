// STATUS: PLATIN — verifies bounded encrypted Task export and import parity.
import { describe, expect, it } from 'vitest';
import type { TaskItem } from '../../../../shared/contracts/work-management/workspaceWork';
import { TASK_IMPORT_MAX_TASKS } from '../../interchange/taskInterchangeEngine';
import {
  decryptTaskBundle,
  exportEncryptedTaskBundle,
  VTASK_BUNDLE_AES_GCM_TAG_BYTES,
  VTASK_BUNDLE_MAX_CIPHERTEXT_BYTES,
  VTASK_BUNDLE_MAX_PLAINTEXT_BYTES,
} from '../../interchange/taskEncryptedBundle';

const task: TaskItem = { id: 'task-bundle-roundtrip', title: 'Encrypted bundle boundary', completed: false, priority: 'medium' };
const passphrase = 'bundle-regression-passphrase-2026';

describe('encrypted Task bundle resource boundary', () => {
  it('rejects task counts the matching importer cannot accept before deriving a key', async () => {
    const oversizedTaskList = Array.from({ length: TASK_IMPORT_MAX_TASKS + 1 }, (_, index) => ({ ...task, id: `task-${index}` }));

    await expect(exportEncryptedTaskBundle(oversizedTaskList, passphrase)).rejects.toThrow(/task count exceeds the import limit/u);
  });

  it('rejects UTF-8 payloads larger than the importer-side ciphertext budget', async () => {
    const oversizedTask: TaskItem = {
      ...task,
      description: 'x'.repeat(VTASK_BUNDLE_MAX_PLAINTEXT_BYTES + 1),
    };

    await expect(exportEncryptedTaskBundle([oversizedTask], passphrase)).rejects.toThrow(/plaintext exceeds the encrypted bundle resource limit/u);
  });

  it('keeps exported ciphertext within the accepted byte ceiling and roundtrips through the same sanitizer', async () => {
    const bundle = await exportEncryptedTaskBundle([task], passphrase);
    const cipherBytes = bundle.ciphertextHex.length / 2;
    const restored = await decryptTaskBundle(bundle, passphrase);

    expect(cipherBytes).toBeLessThanOrEqual(VTASK_BUNDLE_MAX_CIPHERTEXT_BYTES);
    expect(cipherBytes).toBeGreaterThan(VTASK_BUNDLE_AES_GCM_TAG_BYTES);
    expect(VTASK_BUNDLE_MAX_PLAINTEXT_BYTES + VTASK_BUNDLE_AES_GCM_TAG_BYTES).toBe(VTASK_BUNDLE_MAX_CIPHERTEXT_BYTES);
    expect(restored.tasks[0]).toMatchObject({ id: task.id, title: task.title, priority: task.priority });
  });
});
