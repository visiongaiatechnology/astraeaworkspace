import React from 'react';
import type { EditionWorkManagementProps } from '../../contracts/editionRuntimeTypes';
import { TasksOnlyManagement } from '../../../apps/tasks/app/TasksOnlyManagement';

// AST-1001: `EditionWorkManagementProps` declares `onCreateDerivedDocument`, `documents` and
// `onOpenDocument`, and `shell/workspace/AppWorkspaceView.tsx` passes all three — but this runtime
// used to drop them, so the capability could never reach the Tasks surface. A prop an intermediate
// layer swallows is the same defect one level up, so all three are forwarded here and asserted by a
// contract rather than assumed.
export const EditionWorkManagement: React.FC<EditionWorkManagementProps> = ({ document, onUpdateDocument, onCreateDerivedDocument, documents, onOpenDocument }) => (
  <TasksOnlyManagement
    document={document}
    onUpdateDocument={onUpdateDocument}
    onCreateDerivedDocument={onCreateDerivedDocument}
    documents={documents}
    onOpenDocument={onOpenDocument}
  />
);
