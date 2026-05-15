import Image from "next/image";
import { CARRIER_COLORS } from "@/lib/carrier-colors";
import { CARRIER_LOGOS } from "@/lib/carrier-logos";
import type { Carrier } from "@/lib/types";
import { cn } from "@/lib/utils";

type CarrierLogoBadgeSize = "sm" | "md";

interface CarrierLogoBadgeProps {
  carrier: Carrier;
  size?: CarrierLogoBadgeSize;
  className?: string;
}

const SIZE_CLASSES: Record<CarrierLogoBadgeSize, string> = {
  sm: "h-6 w-6 rounded-md",
  md: "h-8 w-8 rounded-lg",
};

const IMAGE_SIZES: Record<CarrierLogoBadgeSize, number> = {
  sm: 24,
  md: 32,
};

function carrierInitial(carrier: Carrier) {
  if (carrier === "iA") return "iA";
  return carrier.charAt(0);
}

export function CarrierLogoBadge({
  carrier,
  size = "sm",
  className,
}: CarrierLogoBadgeProps) {
  const logoSrc = CARRIER_LOGOS[carrier];
  const dimension = IMAGE_SIZES[size];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.06)]",
        SIZE_CLASSES[size],
        className
      )}
      aria-hidden="true"
    >
      {logoSrc ? (
        <Image
          src={logoSrc}
          alt={`${carrier} logo`}
          width={dimension}
          height={dimension}
          className="h-full w-full object-contain p-0.5"
        />
      ) : (
        <span
          className={cn(
            "flex h-full w-full items-center justify-center text-[10px] font-bold text-white",
            carrier === "Sun Life" ? "text-[#002147]" : ""
          )}
          style={{ backgroundColor: CARRIER_COLORS[carrier] }}
        >
          {carrierInitial(carrier)}
        </span>
      )}
    </span>
  );
}
