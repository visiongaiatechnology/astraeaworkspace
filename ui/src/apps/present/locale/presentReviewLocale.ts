// STATUS: PLATIN — seven-locale copy for Present comments, review, versions, and activity.
import type { WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

type CommentCopy = Readonly<{
  title: string; close: string; untitled: string; empty: string; reply: string; resolved: string; resolveThread: string;
  defaultReviewer: string; anonymous: string;
  deleteComment: (author: string) => string; authorName: string; authorPlaceholder: string; commentPlaceholder: string;
  replyPlaceholder: string; post: string; replyToThread: (id: string) => string; cancelReply: string;
  errors: Readonly<{ required: string; generic: string }>;
}>;

type CollaborationCopy = Readonly<{
  title: string; subtitle: string; close: string; reviewState: string;
  defaultReviewer: string; defaultVersionLabel: (version: number) => string;
  statuses: Readonly<Record<'editing' | 'in-review' | 'approved' | 'changes-requested', string>>;
  actorName: string; actorPlaceholder: string; submitReview: string; backToEditing: string;
  approve: string; requestChanges: string; approvals: (count: number) => string;
  reviewMode: (active: boolean) => string; deckVersions: string; versionLabel: string; snapshot: string;
  selectSnapshot: string; noChanges: string; diffStatuses: Readonly<Record<'added' | 'removed' | 'changed', string>>;
  activityHistory: string; noActivity: string; error: string;
}>;

export type PresentReviewCopy = Readonly<{ comments: CommentCopy; collaboration: CollaborationCopy }>;

export const PRESENT_REVIEW_COPY: Readonly<Record<WorkspaceLocale, PresentReviewCopy>> = {
  'en-US': {
    comments: {
      title: 'Slide review and feedback', close: 'Close Present comments dialog', untitled: 'Untitled slide', defaultReviewer: 'Reviewer VGT', anonymous: 'Anonymous',
      empty: 'No review comments yet. Use @name to mention a reviewer.', reply: 'Reply', resolved: 'Resolved', resolveThread: 'Resolve thread',
      deleteComment: (author) => `Delete comment by ${author}`, authorName: 'Your name', authorPlaceholder: 'Your name', commentPlaceholder: 'Add feedback… use @name to mention', replyPlaceholder: 'Write a reply…', post: 'Post comment or reply', replyToThread: (id) => `Replying to thread ${id}`, cancelReply: 'Cancel reply',
      errors: { required: 'Enter a name and comment before posting.', generic: 'The comment could not be posted. Check the text and try again.' },
    },
    collaboration: {
      title: 'Review and versions', subtitle: 'Versions · approvals · activity', close: 'Close Present review and collaboration dialog', reviewState: 'Review state', defaultReviewer: 'Reviewer VGT', defaultVersionLabel: (version) => `Version ${version}`,
      statuses: { editing: 'Editing', 'in-review': 'In review', approved: 'Approved', 'changes-requested': 'Changes requested' },
      actorName: 'Reviewer name', actorPlaceholder: 'Reviewer name', submitReview: 'Submit for review', backToEditing: 'Back to editing', approve: 'Approve', requestChanges: 'Request changes', approvals: (count) => `Approvals: ${count}`, reviewMode: (active) => `Review mode: ${active ? 'on' : 'off'}`,
      deckVersions: 'Presentation versions', versionLabel: 'Version label', snapshot: 'Save snapshot', selectSnapshot: 'Select a snapshot', noChanges: 'No structural or content changes from this snapshot to the current presentation.', diffStatuses: { added: 'Added', removed: 'Removed', changed: 'Changed' }, activityHistory: 'Activity history', noActivity: 'No review activity yet.', error: 'The review update could not be saved. Check the presentation and try again.',
    },
  },
  'de-DE': {
    comments: {
      title: 'Folienprüfung und Feedback', close: 'Present-Kommentardialog schließen', untitled: 'Folie ohne Titel', defaultReviewer: 'Prüfende Person', anonymous: 'Unbekannt',
      empty: 'Noch keine Kommentare. Verwende @Name, um eine prüfende Person zu erwähnen.', reply: 'Antworten', resolved: 'Erledigt', resolveThread: 'Thread abschließen',
      deleteComment: (author) => `Kommentar von ${author} löschen`, authorName: 'Dein Name', authorPlaceholder: 'Dein Name', commentPlaceholder: 'Feedback hinzufügen… mit @Name erwähnen', replyPlaceholder: 'Antwort schreiben…', post: 'Kommentar oder Antwort senden', replyToThread: (id) => `Antwort auf Thread ${id}`, cancelReply: 'Antwort abbrechen',
      errors: { required: 'Gib vor dem Senden einen Namen und einen Kommentar ein.', generic: 'Der Kommentar konnte nicht gesendet werden. Prüfe den Text und versuche es erneut.' },
    },
    collaboration: {
      title: 'Prüfung und Versionen', subtitle: 'Versionen · Freigaben · Aktivitäten', close: 'Present-Prüfungs- und Zusammenarbeitsdialog schließen', reviewState: 'Prüfstatus', defaultReviewer: 'Prüfende Person', defaultVersionLabel: (version) => `Version ${version}`,
      statuses: { editing: 'In Bearbeitung', 'in-review': 'Wird geprüft', approved: 'Freigegeben', 'changes-requested': 'Änderungen angefordert' },
      actorName: 'Name der prüfenden Person', actorPlaceholder: 'Name der prüfenden Person', submitReview: 'Zur Prüfung einreichen', backToEditing: 'Zurück zur Bearbeitung', approve: 'Freigeben', requestChanges: 'Änderungen anfordern', approvals: (count) => `Freigaben: ${count}`, reviewMode: (active) => `Prüfmodus: ${active ? 'aktiv' : 'aus'}`,
      deckVersions: 'Präsentationsversionen', versionLabel: 'Versionsbezeichnung', snapshot: 'Momentaufnahme speichern', selectSnapshot: 'Momentaufnahme auswählen', noChanges: 'Zwischen dieser Momentaufnahme und der aktuellen Präsentation gibt es keine strukturellen oder inhaltlichen Änderungen.', diffStatuses: { added: 'Hinzugefügt', removed: 'Entfernt', changed: 'Geändert' }, activityHistory: 'Aktivitätsverlauf', noActivity: 'Noch keine Prüfaktivitäten.', error: 'Die Prüfungsänderung konnte nicht gespeichert werden. Prüfe die Präsentation und versuche es erneut.',
    },
  },
  'ru-RU': {
    comments: {
      title: 'Отзывы и обсуждение слайда', close: 'Закрыть окно комментариев Present', untitled: 'Слайд без названия', defaultReviewer: 'Рецензент', anonymous: 'Анонимный участник',
      empty: 'Комментариев пока нет. Используйте @имя, чтобы упомянуть рецензента.', reply: 'Ответить', resolved: 'Решено', resolveThread: 'Закрыть обсуждение',
      deleteComment: (author) => `Удалить комментарий автора ${author}`, authorName: 'Ваше имя', authorPlaceholder: 'Ваше имя', commentPlaceholder: 'Добавить отзыв… упомяните участника через @имя', replyPlaceholder: 'Написать ответ…', post: 'Опубликовать комментарий или ответ', replyToThread: (id) => `Ответ в обсуждении ${id}`, cancelReply: 'Отменить ответ',
      errors: { required: 'Перед публикацией укажите имя и текст комментария.', generic: 'Не удалось опубликовать комментарий. Проверьте текст и повторите попытку.' },
    },
    collaboration: {
      title: 'Проверка и версии', subtitle: 'Версии · согласования · действия', close: 'Закрыть окно проверки и совместной работы Present', reviewState: 'Статус проверки', defaultReviewer: 'Рецензент', defaultVersionLabel: (version) => `Версия ${version}`,
      statuses: { editing: 'Редактирование', 'in-review': 'На проверке', approved: 'Одобрено', 'changes-requested': 'Запрошены изменения' },
      actorName: 'Имя рецензента', actorPlaceholder: 'Имя рецензента', submitReview: 'Отправить на проверку', backToEditing: 'Вернуться к редактированию', approve: 'Одобрить', requestChanges: 'Запросить изменения', approvals: (count) => `Согласований: ${count}`, reviewMode: (active) => `Режим проверки: ${active ? 'включён' : 'выключен'}`,
      deckVersions: 'Версии презентации', versionLabel: 'Название версии', snapshot: 'Сохранить снимок', selectSnapshot: 'Выберите снимок', noChanges: 'Между этим снимком и текущей презентацией нет структурных изменений или изменений содержимого.', diffStatuses: { added: 'Добавлено', removed: 'Удалено', changed: 'Изменено' }, activityHistory: 'История действий', noActivity: 'Действий по проверке пока нет.', error: 'Не удалось сохранить изменение статуса проверки. Проверьте презентацию и повторите попытку.',
    },
  },
  'it-IT': {
    comments: {
      title: 'Revisione e feedback della diapositiva', close: 'Chiudi la finestra dei commenti Present', untitled: 'Diapositiva senza titolo', defaultReviewer: 'Revisore', anonymous: 'Anonimo',
      empty: 'Non ci sono ancora commenti. Usa @nome per menzionare un revisore.', reply: 'Rispondi', resolved: 'Risolto', resolveThread: 'Risolvi discussione',
      deleteComment: (author) => `Elimina il commento di ${author}`, authorName: 'Il tuo nome', authorPlaceholder: 'Il tuo nome', commentPlaceholder: 'Aggiungi feedback… usa @nome per menzionare', replyPlaceholder: 'Scrivi una risposta…', post: 'Pubblica commento o risposta', replyToThread: (id) => `Risposta alla discussione ${id}`, cancelReply: 'Annulla risposta',
      errors: { required: 'Inserisci un nome e un commento prima di pubblicare.', generic: 'Impossibile pubblicare il commento. Controlla il testo e riprova.' },
    },
    collaboration: {
      title: 'Revisione e versioni', subtitle: 'Versioni · approvazioni · attività', close: 'Chiudi la finestra di revisione e collaborazione Present', reviewState: 'Stato revisione', defaultReviewer: 'Revisore', defaultVersionLabel: (version) => `Versione ${version}`,
      statuses: { editing: 'In modifica', 'in-review': 'In revisione', approved: 'Approvata', 'changes-requested': 'Modifiche richieste' },
      actorName: 'Nome del revisore', actorPlaceholder: 'Nome del revisore', submitReview: 'Invia per revisione', backToEditing: 'Torna alla modifica', approve: 'Approva', requestChanges: 'Richiedi modifiche', approvals: (count) => `Approvazioni: ${count}`, reviewMode: (active) => `Modalità revisione: ${active ? 'attiva' : 'disattivata'}`,
      deckVersions: 'Versioni della presentazione', versionLabel: 'Etichetta versione', snapshot: 'Salva snapshot', selectSnapshot: 'Seleziona uno snapshot', noChanges: 'Nessuna modifica strutturale o di contenuto tra questo snapshot e la presentazione attuale.', diffStatuses: { added: 'Aggiunto', removed: 'Rimosso', changed: 'Modificato' }, activityHistory: 'Cronologia attività', noActivity: 'Nessuna attività di revisione.', error: 'Impossibile salvare la revisione. Controlla la presentazione e riprova.',
    },
  },
  'es-ES': {
    comments: {
      title: 'Revisión y comentarios de la diapositiva', close: 'Cerrar los comentarios de Present', untitled: 'Diapositiva sin título', defaultReviewer: 'Persona revisora', anonymous: 'Anónimo',
      empty: 'Aún no hay comentarios. Usa @nombre para mencionar a una persona revisora.', reply: 'Responder', resolved: 'Resuelto', resolveThread: 'Resolver hilo',
      deleteComment: (author) => `Eliminar el comentario de ${author}`, authorName: 'Tu nombre', authorPlaceholder: 'Tu nombre', commentPlaceholder: 'Añadir comentarios… usa @nombre para mencionar', replyPlaceholder: 'Escribe una respuesta…', post: 'Publicar comentario o respuesta', replyToThread: (id) => `Responder al hilo ${id}`, cancelReply: 'Cancelar respuesta',
      errors: { required: 'Introduce un nombre y un comentario antes de publicarlo.', generic: 'No se pudo publicar el comentario. Comprueba el texto e inténtalo de nuevo.' },
    },
    collaboration: {
      title: 'Revisión y versiones', subtitle: 'Versiones · aprobaciones · actividad', close: 'Cerrar la colaboración de revisión de Present', reviewState: 'Estado de revisión', defaultReviewer: 'Persona revisora', defaultVersionLabel: (version) => `Versión ${version}`,
      statuses: { editing: 'En edición', 'in-review': 'En revisión', approved: 'Aprobada', 'changes-requested': 'Cambios solicitados' },
      actorName: 'Nombre de la persona revisora', actorPlaceholder: 'Nombre de la persona revisora', submitReview: 'Enviar a revisión', backToEditing: 'Volver a la edición', approve: 'Aprobar', requestChanges: 'Solicitar cambios', approvals: (count) => `Aprobaciones: ${count}`, reviewMode: (active) => `Modo de revisión: ${active ? 'activo' : 'inactivo'}`,
      deckVersions: 'Versiones de la presentación', versionLabel: 'Etiqueta de versión', snapshot: 'Guardar instantánea', selectSnapshot: 'Seleccionar instantánea', noChanges: 'No hay cambios de estructura ni de contenido entre esta instantánea y la presentación actual.', diffStatuses: { added: 'Añadido', removed: 'Eliminado', changed: 'Modificado' }, activityHistory: 'Historial de actividad', noActivity: 'Aún no hay actividad de revisión.', error: 'No se pudo guardar la actualización de revisión. Comprueba la presentación e inténtalo de nuevo.',
    },
  },
  'ja-JP': {
    comments: {
      title: 'スライドのレビューとフィードバック', close: 'Present コメントを閉じる', untitled: 'タイトルなしのスライド', defaultReviewer: 'レビュアー', anonymous: '匿名',
      empty: 'レビュー コメントはまだありません。@名前 でレビュー担当者にメンションできます。', reply: '返信', resolved: '解決済み', resolveThread: 'スレッドを解決',
      deleteComment: (author) => `${author} のコメントを削除`, authorName: '名前', authorPlaceholder: '名前', commentPlaceholder: 'フィードバックを追加… @名前 でメンション', replyPlaceholder: '返信を入力…', post: 'コメントまたは返信を投稿', replyToThread: (id) => `スレッド ${id} に返信中`, cancelReply: '返信をキャンセル',
      errors: { required: '投稿するには名前とコメントを入力してください。', generic: 'コメントを投稿できませんでした。内容を確認して再試行してください。' },
    },
    collaboration: {
      title: 'レビューとバージョン', subtitle: 'バージョン · 承認 · アクティビティ', close: 'Present のレビューと共同作業を閉じる', reviewState: 'レビュー状態', defaultReviewer: 'レビュアー', defaultVersionLabel: (version) => `バージョン ${version}`,
      statuses: { editing: '編集中', 'in-review': 'レビュー中', approved: '承認済み', 'changes-requested': '変更を依頼済み' },
      actorName: 'レビュー担当者名', actorPlaceholder: 'レビュー担当者名', submitReview: 'レビューに提出', backToEditing: '編集に戻る', approve: '承認', requestChanges: '変更を依頼', approvals: (count) => `承認数: ${count}`, reviewMode: (active) => `レビューモード: ${active ? 'オン' : 'オフ'}`,
      deckVersions: 'プレゼンテーションのバージョン', versionLabel: 'バージョン名', snapshot: 'スナップショットを保存', selectSnapshot: 'スナップショットを選択', noChanges: 'このスナップショットと現在のプレゼンテーションに構造または内容の変更はありません。', diffStatuses: { added: '追加', removed: '削除', changed: '変更' }, activityHistory: 'アクティビティ履歴', noActivity: 'レビュー アクティビティはまだありません。', error: 'レビューの更新を保存できませんでした。プレゼンテーションを確認して再試行してください。',
    },
  },
  'zh-CN': {
    comments: {
      title: '幻灯片审阅与反馈', close: '关闭 Present 评论对话框', untitled: '未命名幻灯片', defaultReviewer: '审阅者', anonymous: '匿名用户',
      empty: '暂无审阅评论。使用 @名称 提及审阅者。', reply: '回复', resolved: '已解决', resolveThread: '解决讨论串',
      deleteComment: (author) => `删除 ${author} 的评论`, authorName: '你的姓名', authorPlaceholder: '你的姓名', commentPlaceholder: '添加反馈… 使用 @名称 提及', replyPlaceholder: '撰写回复…', post: '发布评论或回复', replyToThread: (id) => `正在回复讨论串 ${id}`, cancelReply: '取消回复',
      errors: { required: '发布前请输入姓名和评论内容。', generic: '无法发布评论。请检查内容并重试。' },
    },
    collaboration: {
      title: '审阅与版本', subtitle: '版本 · 审批 · 活动', close: '关闭 Present 审阅与协作对话框', reviewState: '审阅状态', defaultReviewer: '审阅者', defaultVersionLabel: (version) => `版本 ${version}`,
      statuses: { editing: '编辑中', 'in-review': '审阅中', approved: '已批准', 'changes-requested': '已请求修改' },
      actorName: '审阅者姓名', actorPlaceholder: '审阅者姓名', submitReview: '提交审阅', backToEditing: '返回编辑', approve: '批准', requestChanges: '请求修改', approvals: (count) => `审批数：${count}`, reviewMode: (active) => `审阅模式：${active ? '开启' : '关闭'}`,
      deckVersions: '演示文稿版本', versionLabel: '版本标签', snapshot: '保存快照', selectSnapshot: '选择快照', noChanges: '此快照与当前演示文稿之间没有结构或内容更改。', diffStatuses: { added: '已添加', removed: '已移除', changed: '已更改' }, activityHistory: '活动历史', noActivity: '暂无审阅活动。', error: '无法保存审阅更新。请检查演示文稿并重试。',
    },
  },
};

export function presentCommentFailureCopy(locale: WorkspaceLocale, cause: unknown): string {
  const copy = PRESENT_REVIEW_COPY[locale].comments;
  if (cause instanceof Error && cause.message === 'present_comment_required_fields') return copy.errors.required;
  return copy.errors.generic;
}

export function presentReviewFailureCopy(locale: WorkspaceLocale, _cause: unknown): string {
  return PRESENT_REVIEW_COPY[locale].collaboration.error;
}
