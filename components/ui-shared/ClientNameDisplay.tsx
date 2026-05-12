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
  xs: "text-xs gap-1.5",
  sm: "text-sm gap-1.5",
  md: "text-base gap-2",
  lg: "text-2xl md:text-3xl gap-2",
};

const LAST_NAME_CLASS: Record<ClientNameDisplaySize, string> = {
  xs: "px-1.5 py-0.5 text-[9px]",
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-2 py-0.5 text-[10px]",
  lg: "px-2.5 py-1 text-[11px]",
};

const CROWN_CLASS: Record<ClientNameDisplaySize, string> = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-3.5 w-3.5",
  lg: "h-3.5 w-3.5",
};

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
        "inline-flex min-w-0 max-w-full items-center font-semibold leading-tight",
        SIZE_CLASS[size],
        isVip ? "text-amber-900" : "text-slate-900",
        className
      )}
    >
      <span className="min-w-0 truncate">{firstName}</span>
      {lastName ? (
        <span
          className={cn(
            "shrink-0 rounded-md bg-slate-100 font-semibold uppercase leading-none tracking-[0.08em] text-slate-500 ring-1 ring-slate-200",
            isVip && "bg-amber-50 text-amber-700 ring-amber-100",
            LAST_NAME_CLASS[size],
            lastNameClassName
          )}
        >
          {lastName}
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
