import type { ReactNode } from "react";
import { ScrollArea } from "@/shared/ui/scroll-area";

interface SidebarShellProps {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
}

export function SidebarShell({ children, header, footer }: SidebarShellProps) {
  return (
    <div className="flex h-full flex-col">
      {header != null && <div className="shrink-0">{header}</div>}
      <ScrollArea className="min-h-0 flex-1 p-2">{children}</ScrollArea>
      {footer != null && <div className="shrink-0 border-t border-border p-4">{footer}</div>}
    </div>
  );
}
