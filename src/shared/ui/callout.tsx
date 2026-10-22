import { Lightbulb, TriangleAlert } from "lucide-react";
import type * as React from "react";

import { cn } from "@/shared/lib/utils";

const VARIANTS = {
  tip: {
    icon: Lightbulb,
    box: "border-primary/30 bg-primary/5",
    accent: "text-primary",
  },
  warning: {
    icon: TriangleAlert,
    box: "border-warn/40 bg-warn/10",
    accent: "text-warn",
  },
} as const;

export type CalloutVariant = keyof typeof VARIANTS;

interface CalloutProps {
  variant: CalloutVariant;
  /** Short heading of the note ("Tip", "Warning"…), also its accessible name. */
  title: string;
  children: React.ReactNode;
  className?: string;
}

/** A highlighted side note in long-form content: a tip, or a warning about a consequence. */
function Callout({ variant, title, children, className }: CalloutProps) {
  const { icon: Icon, box, accent } = VARIANTS[variant];
  return (
    <div
      role="note"
      aria-label={title}
      data-slot="callout"
      data-variant={variant}
      className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", box, className)}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", accent)} aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1.5 leading-relaxed text-foreground/90 [&_p]:m-0">
        <p className={cn("font-semibold", accent)}>{title}</p>
        {children}
      </div>
    </div>
  );
}

export { Callout };
