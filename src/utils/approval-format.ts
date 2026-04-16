import type { ImportedContentApproval } from "../domain/approval";

const formatApprovalSummary = (
  approval: ImportedContentApproval | null | undefined
): string | null => {
  if (!approval) {
    return null;
  }

  const parts: string[] = [approval.state];
  if (approval.sourceBindingId) {
    parts.push(`binding ${approval.sourceBindingId}`);
  }
  if (approval.sourceActorId) {
    parts.push(`actor ${approval.sourceActorId}`);
  }
  if (approval.reviewedAt) {
    parts.push(`reviewed ${approval.reviewedAt}`);
  }

  return parts.join(" • ");
};

export { formatApprovalSummary };
