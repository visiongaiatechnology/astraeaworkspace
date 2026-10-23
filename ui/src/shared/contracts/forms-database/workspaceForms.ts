// STATUS: DIAMANT VGT SUPREME — Forms & Database Types
// Canonical local-first model. Builder metadata remains inside the Forms document.

export type FormPreviewDevice = 'desktop' | 'tablet' | 'mobile';
export type FormCardStyle = 'flat' | 'soft' | 'glass';
export type FormFieldSpacing = 'compact' | 'comfortable' | 'spacious';

export interface FormPage {
  id: string;
  title: string;
  description?: string;
  order: number;
}

export interface FormSettings {
  submitLabel: string;
  confirmationMessage: string;
  showProgress: boolean;
  showQuestionNumbers: boolean;
  allowQuestionMedia: boolean;
  previewDevice: FormPreviewDevice;
  defaultLanguage: string;
  textDirection: 'auto' | 'ltr' | 'rtl';
  allowResponseDelete: boolean;
  allowResponseAnonymize: boolean;
}

export interface FormTheme {
  primaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  fontFamily: 'system' | 'serif' | 'mono';
  cardStyle: FormCardStyle;
  fieldSpacing: FormFieldSpacing;
  logoDataUrl?: string;
  backgroundImageDataUrl?: string;
}

export interface FormLocalizedPageText { title?: string; description?: string; }
export interface FormLocalizedFieldText { label?: string; helpText?: string; placeholder?: string; }
export interface FormLocalizationBundle {
  language: string;
  title?: string;
  description?: string;
  submitLabel?: string;
  confirmationMessage?: string;
  pages: Record<string, FormLocalizedPageText>;
  fields: Record<string, FormLocalizedFieldText>;
}

export interface FormBuilderAttachment {
  id: string;
  fieldId: string;
  kind: 'image' | 'video';
  name: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'video/mp4' | 'video/webm';
  sizeBytes: number;
  sha256: string;
  dataUrl: string;
  createdAt: number;
}

export interface FormReusableField {
  id: string;
  name: string;
  field: FormField;
  createdAt: number;
}

export type FormQuizReleasePolicy = 'immediate' | 'after_manual' | 'manual';
export type FormQuizSecureTestPolicy = 'off' | 'require_enforced_host';

export interface FormQuizQuestionConfig {
  fieldId: string;
  points: number;
  correctAnswers: string[];
  partialCredit?: boolean;
  explanation?: string;
  caseSensitive?: boolean;
  numericTolerance?: number;
  manualGrading?: boolean;
  poolId?: string;
}

export interface FormQuizPool {
  id: string;
  name: string;
  pickCount: number;
}

export interface FormQuizConfig {
  enabled: boolean;
  passingPercentage: number;
  releasePolicy: FormQuizReleasePolicy;
  practiceMode: boolean;
  randomizeQuestions: boolean;
  randomizeAnswers: boolean;
  timeLimitMinutes?: number;
  maxAttempts?: number;
  secureTestPolicy: FormQuizSecureTestPolicy;
  questions: Record<string, FormQuizQuestionConfig>;
  pools: FormQuizPool[];
}

export interface FormSecureTestAttestation {
  mode: 'native-host' | 'managed-kiosk';
  issuedAt: number;
  expiresAt: number;
  sessionNonce: string;
}

export interface FormAssessmentAttempt {
  sessionId: string;
  attemptNumber: number;
  seed: string;
  startedAt: number;
  submittedAt: number;
  secureTestStatus: 'off' | 'enforced';
  manualGrades?: Record<string, number>;
  released?: boolean;
}


export type FormDistributionChannel = 'local-kiosk' | 'lan-self-hosted' | 'space-members' | 'gaiacom' | 'public-link' | 'embed';
export type FormIdentityMode = 'anonymous' | 'optional' | 'required';
export type FormEditAfterSubmitPolicy = 'never' | 'until-close' | 'always';
export type FormResponseReceiptPolicy = 'off' | 'local';

export interface FormDistributionTarget {
  id: string;
  channel: FormDistributionChannel;
  enabled: boolean;
  label?: string;
  endpointUrl?: string;
  spaceId?: string;
  recipientIds?: string[];
  allowedOrigins?: string[];
}

export interface FormDistributionConfig {
  targets: FormDistributionTarget[];
  acceptResponses: boolean;
  startAt?: number;
  endAt?: number;
  responseQuota?: number;
  identityMode: FormIdentityMode;
  oneResponsePerIdentity: boolean;
  inviteOnly: boolean;
  inviteGrantIds: string[];
  customThankYou: string;
  saveResumeDraft: boolean;
  responseReceipt: FormResponseReceiptPolicy;
  editAfterSubmit: FormEditAfterSubmitPolicy;
}

export interface FormCollectionIdentity {
  key: string;
  verified: boolean;
}

export interface FormResponseCollectionMeta {
  channel: FormDistributionChannel;
  identityKey?: string;
  identityVerified?: true;
  inviteGrantId?: string;
  receiptId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface FormResponseAuditMetadata {
  startedAt?: number;
  submittedAt: number;
  durationMs?: number;
  sourceChannel: FormDistributionChannel;
  formVersion?: number;
  anonymizedAt?: number;
}

export interface FormDraft {
  id: string;
  updatedAt: number;
  answers: Record<string, FormAnswer>;
}




export type FormGovernanceRole = 'owner' | 'editor' | 'auditor' | 'responder';
export type FormGovernanceAction = 'manage' | 'view' | 'export' | 'delete' | 'anonymize';
export type FormClassificationLabel = 'public' | 'internal' | 'confidential' | 'restricted';
export interface FormGovernanceConfig {
  retentionDays?: number; retentionAction: 'delete' | 'anonymize'; metadataMode: 'minimal' | 'operational';
  consentFieldId?: string; consentText?: string; consentVersion?: string;
  allowResponseExport: boolean; allowResponseDelete: boolean; allowResponseAnonymize: boolean;
  atRestPolicy: 'workspace-encrypted-required'; classification: FormClassificationLabel;
  roleGrants: Record<FormGovernanceAction, FormGovernanceRole[]>;
}
export interface FormResponseGovernanceMetadata { consentVersion?: string; consentText?: string; consentRecordedAt?: number; classification: FormClassificationLabel; }
export interface FormGovernanceAuditEntry { id:string; at:number; action:string; role:FormGovernanceRole; responseId?:string; detail?:string; }

export interface FormWebhookNotificationConfig { id: string; endpointUrl: string; keyVaultSecretRef: string; enabled: boolean; }
export interface FormNotificationConfig {
  localNotification: boolean;
  emailConnectorId?: string;
  gaiaComConnectorId?: string;
  webhook?: FormWebhookNotificationConfig;
  maxPerMinute: number;
  retryLimit: number;
  backoffBaseMs: number;
}
export type FormNotificationTargetKind = 'email' | 'gaiacom' | 'webhook';
export interface FormNotificationQueueItem {
  id: string; responseId: string; target: FormNotificationTargetKind; targetRef: string;
  status: 'pending' | 'delivered' | 'failed'; attemptCount: number; createdAt: number; nextAttemptAt: number;
  lastAttemptAt?: number; deliveredAt?: number; lastError?: string;
}

export type FormResponseMappingActionKind = 'task' | 'planner' | 'writer' | 'present' | 'grid' | 'database';
export type FormResponseRuleOperator = 'eq' | 'neq' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'not-empty';
export interface FormResponseMappingRule {
  id: string;
  name: string;
  enabled: boolean;
  fieldId: string;
  operator: FormResponseRuleOperator;
  value?: string | number | boolean;
  actions: FormResponseMappingActionKind[];
}
export interface FormResponseMappingConfig {
  deduplicationFieldIds: string[];
  taskTitleFieldId?: string;
  taskDescriptionFieldIds: string[];
  rules: FormResponseMappingRule[];
}

export interface FormTemplate {
  id: string;
  name: string;
  description: string;
  scope: 'builtin' | 'user' | 'org';
  pages: FormPage[];
  fields: FormField[];
  settings: FormSettings;
  theme: FormTheme;
  logicRules?: FormConditionalLogicRule[];
  quizConfig?: FormQuizConfig;
  distributionConfig?: FormDistributionConfig;
  localizations?: FormLocalizationBundle[];
  responseMappingConfig?: FormResponseMappingConfig;
  notificationConfig?: FormNotificationConfig;
  governanceConfig?: FormGovernanceConfig;
}

export interface FormsModel {
  title?: string;
  description?: string;
  fields: FormField[];
  responses: FormResponse[];
  pages?: FormPage[];
  settings?: FormSettings;
  theme?: FormTheme;
  builderAttachments?: FormBuilderAttachment[];
  fieldLibrary?: FormReusableField[];
  templates?: FormTemplate[];
  logicRules?: FormConditionalLogicRule[];
  quizConfig?: FormQuizConfig;
  distributionConfig?: FormDistributionConfig;
  localizations?: FormLocalizationBundle[];
  responseMappingConfig?: FormResponseMappingConfig;
  notificationConfig?: FormNotificationConfig;
  notificationQueue?: FormNotificationQueueItem[];
  governanceConfig?: FormGovernanceConfig;
  governanceAuditLog?: FormGovernanceAuditEntry[];
  drafts?: FormDraft[];
}

export type FormFileQuarantineState = 'released' | 'blocked';
export type FormFileScanState = 'not-configured' | 'clean' | 'blocked';
export interface FormFileAnswerItem {
  id: string;
  name: string;
  storageName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  dataUrl: string;
  quarantineState: FormFileQuarantineState;
  scanState: FormFileScanState;
  storageDisposition: 'encrypted-form-document';
  previewPolicy: 'metadata-only';
}

export type FormStructuredAnswer = Record<string, string | number | boolean>;
export type FormAnswer = string | number | boolean | string[] | FormStructuredAnswer | FormFileAnswerItem[];


export type FormConditionalLogicOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'is_empty' | 'not_empty';
export interface FormConditionalLogicCondition {
  id: string;
  fieldId: string;
  operator: FormConditionalLogicOperator;
  value: FormAnswer;
}
export type FormConditionalLogicActionType = 'show_field' | 'hide_field' | 'show_section' | 'hide_section' | 'branch_to_section' | 'end_form' | 'require_field' | 'set_calculated';
export interface FormConditionalLogicAction {
  id: string;
  type: FormConditionalLogicActionType;
  targetId?: string;
  expression?: string;
}
export interface FormConditionalLogicRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  when: { mode: 'and' | 'or'; conditions: FormConditionalLogicCondition[] };
  actions: FormConditionalLogicAction[];
}

export type FormFieldType =
  | 'text'
  | 'long-text'
  | 'number'
  | 'email'
  | 'url'
  | 'telephone'
  | 'date'
  | 'time'
  | 'datetime'
  | 'choice'
  | 'checkboxes'
  | 'dropdown'
  | 'rating'
  | 'likert'
  | 'ranking'
  | 'scale'
  | 'nps'
  | 'file-upload'
  | 'image-choice'
  | 'signature'
  | 'consent'
  | 'address'
  | 'person'
  | 'section'
  | 'description'
  | 'hidden'
  | 'calculated';

export interface FormConditionalRule {
  fieldId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  value: FormAnswer;
}


export type FormCrossFieldValidationOperator = 'equals' | 'not_equals' | 'greater_than' | 'greater_or_equal' | 'less_than' | 'less_or_equal';
export interface FormCrossFieldValidationRule {
  id: string;
  otherFieldId: string;
  operator: FormCrossFieldValidationOperator;
  message?: string;
}

export interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  options?: string[];
  required: boolean;
  placeholder?: string;
  helpText?: string;
  richText?: string;
  internalName?: string;
  pageId?: string;
  sectionId?: string;
  attachmentIds?: string[];
  numberMode?: 'integer' | 'decimal' | 'currency';
  currencyCode?: string;
  matrixRows?: string[];
  matrixColumns?: string[];
  scaleMode?: 'buttons' | 'slider';
  signatureMode?: 'typed' | 'acknowledgement';
  calculationExpression?: string;
  calculationPrecision?: number;
  hiddenDefault?: string | number | boolean;
  validationMessage?: string;
  dateMin?: string;
  dateMax?: string;
  allowedValues?: string[];
  crossFieldValidation?: FormCrossFieldValidationRule[];
  fileMaxBytes?: number;
  fileMaxCount?: number;
  fileAllowedMimeTypes?: string[];
  filePolicyEnabled?: boolean;
  fileScannerMode?: 'optional' | 'required';
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  scaleMin?: number;
  scaleMax?: number;
  showWhen?: FormConditionalRule;
}

export interface FormResponse {
  id: string;
  timestamp: number;
  answers: Record<string, FormAnswer>;
  assessment?: FormAssessmentAttempt;
  collection?: FormResponseCollectionMeta;
  audit?: FormResponseAuditMetadata;
  governance?: FormResponseGovernanceMetadata;
}

