// STATUS: DIAMANT VGT SUPREME — stable SyncGraph public compatibility facade.
// Durable merge truth remains vgt-syncgraph (Rust); implementation owners never apply document mutations.
export { SYNCGRAPH_SCHEMA_VERSION, SYNCGRAPH_MAX_NODE_BYTES, SYNCGRAPH_MAX_NODE_DEPTH, SYNCGRAPH_MAX_NODE_COUNT, SYNCGRAPH_MAX_OBJECT_IDS, SYNCGRAPH_MAX_PARENT_IDS, SYNCGRAPH_MAX_VECTOR_ACTORS, SYNCGRAPH_MAX_FRAME_BYTES, SYNCGRAPH_MAX_QUARANTINED_FUTURE, SYNCGRAPH_MAX_PRESENCE, SYNCGRAPH_PRESENCE_TTL_MS, SYNCGRAPH_MAX_REVIEW_COMMENTS, SYNCGRAPH_MAX_COMMENT_BODY, SYNCGRAPH_MAX_MENTIONS, SYNCGRAPH_RATE_WINDOW_MS, SYNCGRAPH_MAX_INGRESS_PER_WINDOW, SYNCGRAPH_MAX_REPLAYS_PER_WINDOW, SyncGraphBoundaryError, classifyInboundOperation } from './syncGraphIngressPolicy';
export type { SyncObjectFamily, SyncMergeStrategy, SyncCausalMetadata, SyncOperationEnvelope, QuarantinedFutureOperation, InboundOperationClassification } from './syncGraphIngressPolicy';
export { mergeStrategyForObjectFamily, createVisibleConflictDecision, OperationReplayWindow, SyncIngressRateLimiter } from './syncGraphConflictPolicy';
export type { VisibleConflictDecision } from './syncGraphConflictPolicy';
export { createResumeRequest, createQueueRecoveryDiagnostic } from './syncGraphRecoveryPolicy';
export type { SyncFrontier, SyncResumeRequest, QueueRecoveryDiagnostic } from './syncGraphRecoveryPolicy';
export { EphemeralPresenceRegistry, extractReviewMentions, createDurableReviewObject } from './syncGraphPresencePolicy';
export type { PresenceRecord, DurableReviewInput } from './syncGraphPresencePolicy';
export { authorizeRemoteMaterialization, validateTransportFrame, deriveMembershipRotationPlan, assertPeerSessionCurrent } from './syncGraphTransportPolicy';
export type { AuthenticatedTransportIdentity, EncryptedSyncTransportFrame, SyncTransportAdapter, MembershipRotationPlan } from './syncGraphTransportPolicy';
export { syncGraphPlatformContract, createSafeSyncDiagnostics } from './syncGraphDiagnosticsPolicy';
export type { SyncGraphPlatform, SyncGraphPlatformContract, SyncDiagnosticsSafe } from './syncGraphDiagnosticsPolicy';
