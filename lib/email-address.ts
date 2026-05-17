export function isPlaceholderEmail(email: string | undefined | null) {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;

  const [localPart, domain] = normalized.split("@");
  return (
    normalized.includes("noemail") ||
    domain === "triton.invalid" ||
    (domain === "tritonwealth.ca" && localPart.includes("noemail"))
  );
}

export function canSendToEmail(email: string | undefined | null) {
  return !!email?.trim() && !isPlaceholderEmail(email);
}
