import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

interface InfoTooltipProps {
  /** Tooltip body content. Plain text or rich JSX. */
  children: ReactNode;
  /** Side the tooltip prefers to open on. Default: "right". */
  side?: "top" | "right" | "bottom" | "left";
  /** Optional class for the trigger button (icon size, color overrides). */
  className?: string;
  /** Accessible label for screen readers. */
  ariaLabel?: string;
}

/**
 * Small info-icon trigger that opens a Tooltip on hover/focus. Designed to be
 * placed inline next to form labels (Label + InfoTooltip) to surface
 * field-level context without bloating the form layout.
 *
 * Requires a TooltipProvider ancestor — `AppProviders` mounts one globally.
 */
export function InfoTooltip({ children, side = "right", className, ariaLabel }: InfoTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel ?? "More info"}
          className={cn(
            "inline-flex shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none",
            className,
          )}
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs text-xs leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
