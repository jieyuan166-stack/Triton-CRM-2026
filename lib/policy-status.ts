import type { Policy } from "@/lib/types";

export function compareLapsedLast(
  a: Pick<Policy, "status">,
  b: Pick<Policy, "status">
): number {
  return Number(a.status === "lapsed") - Number(b.status === "lapsed");
}
