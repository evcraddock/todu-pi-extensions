import type { ImportedContentApproval, ApprovalItem } from "../domain/approval";
import type { NoteSummary } from "../domain/note";
import type {
  IntegrationBinding,
  IntegrationBindingActorMapping,
  IntegrationBindingStatus,
} from "../services/project-integration-service";

export const projectContentApproval = (
  approval: ImportedContentApproval | null
): ImportedContentApproval | null =>
  approval === null
    ? null
    : {
        state: approval.state,
        sourceBindingId: approval.sourceBindingId,
        sourceActorId: approval.sourceActorId,
        sourceFingerprint: approval.sourceFingerprint,
        reviewedAt: approval.reviewedAt,
        reviewedByActorId: approval.reviewedByActorId,
      };
export const projectNote = (note: NoteSummary): NoteSummary => ({
  id: note.id,
  content: note.content,
  authorActorId: note.authorActorId,
  authorDisplayName: note.authorDisplayName,
  author: note.author,
  contentApproval: projectContentApproval(note.contentApproval),
  entityType: note.entityType,
  entityId: note.entityId,
  tags: [...note.tags],
  createdAt: note.createdAt,
});
export const projectApprovalItem = (item: ApprovalItem): ApprovalItem => ({
  kind: item.kind,
  state: item.state,
  taskId: item.taskId,
  noteId: item.noteId,
  projectId: item.projectId,
  taskTitle: item.taskTitle,
  entityType: item.entityType,
  entityId: item.entityId,
  contentPreview: item.contentPreview,
  sourceBindingId: item.sourceBindingId,
  sourceActorId: item.sourceActorId,
  sourceFingerprint: item.sourceFingerprint,
  reviewedAt: item.reviewedAt,
  reviewedByActorId: item.reviewedByActorId,
});
export const projectActorMapping = (
  mapping: IntegrationBindingActorMapping
): IntegrationBindingActorMapping => ({
  actorId: mapping.actorId,
  externalAccountId: mapping.externalAccountId,
  externalLogin: mapping.externalLogin,
  displayName: mapping.displayName,
  trusted: mapping.trusted,
});
export const projectBinding = (binding: IntegrationBinding): IntegrationBinding => ({
  id: binding.id,
  provider: binding.provider,
  projectId: binding.projectId,
  targetKind: binding.targetKind,
  targetRef: binding.targetRef,
  strategy: binding.strategy,
  enabled: binding.enabled,
  ...(binding.options === undefined
    ? {}
    : {
        options: {
          ...(binding.options.actorMappings === undefined
            ? {}
            : { actorMappings: binding.options.actorMappings.map(projectActorMapping) }),
        },
      }),
  createdAt: binding.createdAt,
  updatedAt: binding.updatedAt,
});
// Raw diagnostics can embed credentials, headers, paths, or configuration. Preserve
// error presence plus structured state/timestamps, never the unreviewed message.
export const projectBindingStatus = (
  status: IntegrationBindingStatus | null
): IntegrationBindingStatus | null =>
  status === null
    ? null
    : {
        bindingId: status.bindingId,
        state: status.state,
        authorityId: status.authorityId,
        lastSuccessfulSyncAt: status.lastSuccessfulSyncAt,
        lastAttemptedSyncAt: status.lastAttemptedSyncAt,
        lastErrorSummary:
          status.lastErrorSummary === null
            ? null
            : "Integration reported an error; raw diagnostics withheld.",
        updatedAt: status.updatedAt,
      };
