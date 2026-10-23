import React from 'react';
import type { EditionVaultRuntimeProps } from '../../contracts/editionRuntimeTypes';
import { VaultFreeRuntime } from '../apps/vault/VaultFreeRuntime';

export const EditionVaultRuntime: React.FC<EditionVaultRuntimeProps> = (props) => (
  <VaultFreeRuntime {...props} />
);
