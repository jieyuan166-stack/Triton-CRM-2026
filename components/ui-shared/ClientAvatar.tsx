// components/ui-shared/ClientAvatar.tsx
// Soft pastel avatar for clients. Single neutral palette — VIP status now
// lives on the Tags column, not the avatar.
import { cn } from "@/lib/utils";

const SIZE: Record<NonNullable<ClientAvatarProps["size"]>, string> = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-20 w-20 text-xl",
};

export interface ClientAvatarProps {
  firstName: string;
  lastName: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function ClientAvatar({
  firstName,
  lastName,
  size = "sm",
  className,
}: ClientAvatarProps) {
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold ring-1 shrink-0 select-none",
        "bg-slate-100 text-slate-600 ring-slate-200/60",
        SIZE[size],
        className
      )}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
