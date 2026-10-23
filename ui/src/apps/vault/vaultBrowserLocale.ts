// STATUS: GOLD — complete seven-locale copy for Vault navigation and folder creation.
import type { WorkspaceLocale } from '../../shell/localization/workspaceLocaleTypes';

const ENGLISH = {
  root: 'Vault root', favorites: 'Favorites', pinned: 'Pinned', recent: 'Recent', folders: 'Folders',
  emptyFolders: 'No folders yet.', newFolder: 'New folder', newFolderName: 'New folder name', createFolder: 'Create folder',
} as const;
type VaultBrowserKey = keyof typeof ENGLISH;
type VaultBrowserCopy = Record<VaultBrowserKey, string>;
export const VAULT_BROWSER_COPY: Readonly<Record<WorkspaceLocale, VaultBrowserCopy>> = {
  'en-US': ENGLISH,
  'de-DE': { root: 'Vault-Stammordner', favorites: 'Favoriten', pinned: 'Angeheftet', recent: 'Zuletzt verwendet', folders: 'Ordner', emptyFolders: 'Noch keine Ordner.', newFolder: 'Neuer Ordner', newFolderName: 'Name des neuen Ordners', createFolder: 'Ordner erstellen' },
  'es-ES': { root: 'Raíz del Vault', favorites: 'Favoritos', pinned: 'Fijados', recent: 'Recientes', folders: 'Carpetas', emptyFolders: 'Aún no hay carpetas.', newFolder: 'Nueva carpeta', newFolderName: 'Nombre de la nueva carpeta', createFolder: 'Crear carpeta' },
  'it-IT': { root: 'Radice del Vault', favorites: 'Preferiti', pinned: 'Fissati', recent: 'Recenti', folders: 'Cartelle', emptyFolders: 'Non ci sono ancora cartelle.', newFolder: 'Nuova cartella', newFolderName: 'Nome della nuova cartella', createFolder: 'Crea cartella' },
  'ja-JP': { root: 'Vault のルート', favorites: 'お気に入り', pinned: '固定', recent: '最近使った項目', folders: 'フォルダー', emptyFolders: 'フォルダーはまだありません。', newFolder: '新しいフォルダー', newFolderName: '新しいフォルダー名', createFolder: 'フォルダーを作成' },
  'ru-RU': { root: 'Корень Vault', favorites: 'Избранное', pinned: 'Закреплённые', recent: 'Недавние', folders: 'Папки', emptyFolders: 'Папок пока нет.', newFolder: 'Новая папка', newFolderName: 'Имя новой папки', createFolder: 'Создать папку' },
  'zh-CN': { root: 'Vault 根目录', favorites: '收藏', pinned: '已固定', recent: '最近使用', folders: '文件夹', emptyFolders: '尚无文件夹。', newFolder: '新建文件夹', newFolderName: '新文件夹名称', createFolder: '创建文件夹' },
};

export function vaultBrowserText(message: VaultBrowserKey, locale: WorkspaceLocale): string {
  return VAULT_BROWSER_COPY[locale][message];
}
