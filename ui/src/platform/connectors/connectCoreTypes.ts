// STATUS: DIAMANT VGT SUPREME — Astraea Connect canonical core types
export type ConnectAccountKind='mail'|'calendar'|'contacts'|'unified'|'local';
export type ConnectAdapterKind='imap'|'smtp'|'caldav'|'carddav'|'local';
export type ConnectTlsMode='tls'|'starttls-required'|'local-only';
export type ConnectFolderKind='inbox'|'sent'|'drafts'|'archive'|'trash'|'junk'|'custom';
export type ConnectMessageFormat='plain'|'html';
export type ConnectPriority='low'|'normal'|'high';
export type ConnectRsvp='needs-action'|'accepted'|'declined'|'tentative';
export type ConnectCalendarView='day'|'work-week'|'week'|'month'|'agenda';

export interface ConnectEndpoint{host:string;port:number;tls:ConnectTlsMode;proxy?:{kind:'http'|'socks5';host:string;port:number};pinnedCertificateSha256?:string;}
export interface ConnectAdapterConfig{kind:ConnectAdapterKind;endpoint?:ConnectEndpoint;credentialHandle?:string;oauthConnectorId?:string;enabled:boolean;}
export interface ConnectNetworkPolicy{capabilityId?:string;allowHosts:string[];allowCertificateInspection:boolean;failClosedOnTlsError:true;}
export interface ConnectIdentity{id:string;displayName:string;address:string;replyTo?:string;signature?:string;}
export interface ConnectAccount{id:string;name:string;kind:ConnectAccountKind;localOnly:boolean;identities:ConnectIdentity[];username?:string;adapters:ConnectAdapterConfig[];network:ConnectNetworkPolicy;defaultIdentityId:string;createdAt:number;updatedAt:number;}
export interface ConnectConnectivityDiagnostic{accountId:string;adapter:ConnectAdapterKind;ok:boolean;latencyMs:number;code:string;certificateSha256?:string;checkedAt:number;}
export interface ConnectPortableAccount{schema:'astraea-connect-account-v1';id:string;name:string;kind:ConnectAccountKind;localOnly:boolean;identities:ConnectIdentity[];username?:string;adapters:Array<Omit<ConnectAdapterConfig,'credentialHandle'>>;network:ConnectNetworkPolicy;defaultIdentityId:string;}

export interface ConnectAttachment{id:string;name:string;sizeBytes:number;declaredMime:string;detectedMime:string;sha256?:string;safePreview:boolean;malwareScanState:'not-scanned'|'clean'|'blocked'|'unavailable';vaultRef?:string;}
export interface ConnectRecipient{name?:string;address:string;}
export interface ConnectMessage{id:string;accountId:string;messageId:string;threadId:string;folderId:string;labels:string[];from:ConnectRecipient;to:ConnectRecipient[];cc:ConnectRecipient[];bcc:ConnectRecipient[];subject:string;bodyText:string;bodyHtml?:string;format:ConnectMessageFormat;receivedAt:number;sentAt?:number;scheduledAt?:number;priority:ConnectPriority;readReceiptRequested:boolean;isRead:boolean;isStarred:boolean;isPinned:boolean;isFlagged:boolean;snoozeUntil?:number;followUpAt?:number;attachments:ConnectAttachment[];headers:Record<string,string>;remoteContentAllowed:false|{scope:'message'|'domain';value:string};security:ConnectMailSecurity;}
export interface ConnectMailSecurity{encryptedBy?:'pgp'|'smime';signedBy?:'pgp'|'smime';signatureStatus?:'verified'|'invalid'|'expired'|'not-yet-valid'|'unsigned'|'unknown';phishingIndicators:ConnectPhishingIndicator[];remoteContentBlocked:boolean;}
export interface ConnectPhishingIndicator{kind:'punycode'|'display-domain-mismatch'|'suspicious-link'|'remote-tracker';severity:'info'|'warning';explanation:string;}
export interface ConnectFolder{id:string;accountId:string;name:string;kind:ConnectFolderKind;parentId?:string;labels:string[];}
export interface ConnectDraft{id:string;accountId:string;identityId:string;to:ConnectRecipient[];cc:ConnectRecipient[];bcc:ConnectRecipient[];subject:string;bodyText:string;bodyHtml?:string;format:ConnectMessageFormat;attachments:ConnectAttachment[];priority:ConnectPriority;readReceiptRequested:boolean;scheduledAt?:number;replyToMessageId?:string;forwardOfMessageId?:string;updatedAt:number;}
export interface ConnectQueuedSend{id:string;draft:ConnectDraft;releaseAt:number;undoUntil:number;state:'queued'|'cancelled'|'released';createdAt:number;}
export type ConnectRuleField='sender'|'recipient'|'subject'|'header'|'body'|'size'|'attachment';
export interface ConnectMailRule{id:string;name:string;enabled:boolean;all:boolean;conditions:Array<{field:ConnectRuleField;operator:'contains'|'equals'|'gt'|'lt'|'exists';value?:string|number}>;actions:Array<{kind:'move'|'copy'|'tag'|'flag'|'notify';value?:string}>;}
export interface ConnectSavedSearch{id:string;name:string;query:string;createdAt:number;}
export interface ConnectMailCacheState{encrypted:true;accountId:string;syncToken?:string;lastSyncAt?:number;conflicts:Array<{messageId:string;localVersion:number;remoteVersion:number;resolution:'pending'|'local'|'remote'}>;}

export interface ConnectRecurrence{freq:'daily'|'weekly'|'monthly'|'yearly';interval:number;count?:number;until?:string;byWeekday?:number[];exceptions:string[];}
export interface ConnectAttendee{name?:string;address:string;role:'required'|'optional';status:ConnectRsvp;}
export interface ConnectAlert{offsetMinutes:number;method:'local-notification';}
export interface ConnectEvent{id:string;calendarId:string;uid:string;title:string;start:string;end:string;allDay:boolean;timezone:string;location?:string;categories:string[];notes?:string;attachments:ConnectAttachment[];recurrence?:ConnectRecurrence;alerts:ConnectAlert[];organizer?:ConnectRecipient;attendees:ConnectAttendee[];status:'confirmed'|'tentative'|'cancelled';sequence:number;sourceEtag?:string;}
export interface ConnectCalendar{id:string;accountId:string;name:string;colorToken:string;visible:boolean;readOnly:boolean;shared:boolean;permissions:'owner'|'write'|'read';syncToken?:string;}
export interface ConnectFreeBusy{calendarId:string;intervals:Array<{start:string;end:string;busy:boolean}>;source:'local'|'provider';}

export interface ConnectContactField<T=string>{value:T;source:{kind:'local'|'carddav'|'import';sourceId:string;etag?:string};updatedAt:number;}
export interface ConnectContact{id:string;accountId:string;displayName:ConnectContactField;emails:ConnectContactField<string>[];phones:ConnectContactField<string>[];organization?:ConnectContactField;addresses:ConnectContactField<string>[];notes?:ConnectContactField;birthday?:ConnectContactField;photo?:ConnectContactField<string>;customFields:Record<string,ConnectContactField>;tags:string[];favorite:boolean;}
export interface ConnectContactGroup{id:string;accountId:string;name:string;memberIds:string[];tags:string[];}
export interface ConnectCardDavSyncEnvelope{syncToken?:string;changes:Array<{href:string;etag:string;deleted:boolean;contact?:ConnectContact}>;}
export interface ConnectCanonicalReference{uri:string;objectId:string;kind:'mail'|'calendar'|'contact'|'task'|'vault'|'document';mode:'Live'|'Frozen';digest?:string;}
export interface ConnectWorkflowResult{createdReference:ConnectCanonicalReference;sourceReference:ConnectCanonicalReference;metadata:Record<string,string>;}
export interface ConnectSecurityDecision{allowed:boolean;code:string;explanation:string;normalizedUrl?:string;displayHost?:string;}
