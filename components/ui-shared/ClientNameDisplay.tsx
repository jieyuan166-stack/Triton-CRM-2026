// components/ui-shared/ClientNameDisplay.tsx
import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

type ClientNameDisplaySize = "xs" | "sm" | "md" | "lg";

interface ClientNameDisplayProps {
  firstName: string;
  lastName: string;
  isVip?: boolean;
  size?: ClientNameDisplaySize;
  className?: string;
  lastNameClassName?: string;
}

const SIZE_CLASS: Record<ClientNameDisplaySize, string> = {
  xs: "text-xs gap-1",
  sm: "text-sm gap-1",
  md: "text-base gap-1.5",
  lg: "text-2xl md:text-3xl gap-2",
};

const LAST_NAME_CLASS: Record<ClientNameDisplaySize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl md:text-3xl",
};

const CROWN_CLASS: Record<ClientNameDisplaySize, string> = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-3.5 w-3.5",
  lg: "h-3.5 w-3.5",
};

function toTitleCaseName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b[\p{L}\p{N}]/gu, (char) => char.toUpperCase());
}

export function ClientNameDisplay({
  firstName,
  lastName,
  isVip = false,
  size = "sm",
  className,
  lastNameClassName,
}: ClientNameDisplayProps) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-baseline leading-tight",
        SIZE_CLASS[size],
        className
      )}
    >
      <span
        className={cn(
          "min-w-0 truncate font-semibold",
          isVip ? "text-amber-900" : "text-slate-900"
        )}
      >
        {firstName}
      </span>
      {lastName ? (
        <span
          className={cn(
            "shrink-0 font-medium text-slate-500",
            isVip && "text-amber-700",
            LAST_NAME_CLASS[size],
            lastNameClassName
          )}
        >
          {toTitleCaseName(lastName)}
        </span>
      ) : null}
      {isVip ? (
        <Crown
          className={cn("shrink-0 text-amber-500", CROWN_CLASS[size])}
          aria-label="VIP client"
        />
      ) : null}
    </span>
  );
}
