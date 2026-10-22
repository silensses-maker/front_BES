import type * as React from "react";

import { cn } from "@/shared/lib/utils";

/** A key or key combination as the user presses it (e.g. a keyboard shortcut in the manual). */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5",
        "align-[0.1em] font-mono text-[11px] font-medium leading-none text-foreground",
        "shadow-[inset_0_-1px_0_var(--color-border)]",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
