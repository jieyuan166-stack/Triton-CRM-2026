export function isInternalPendingPolicyNumber(policyNumber?: string | null): boolean {
  return !!policyNumber && policyNumber.startsWith("PENDING-");
}

export function displayPolicyNumber(policyNumber?: string | null): string {
  if (!policyNumber || isInternalPendingPolicyNumber(policyNumber)) return "Pending number";
  return policyNumber;
}

export function displayPolicyNumberWithHash(policyNumber?: string | null): string {
  if (!policyNumber || isInternalPendingPolicyNumber(policyNumber)) return "Pending number";
  return `#${policyNumber}`;
}
