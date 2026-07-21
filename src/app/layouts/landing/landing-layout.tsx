import { Outlet, useLocation } from "react-router-dom";
import { TableOfContents } from "@/shared/ui/table-of-contents";
import { LandingFooter } from "./landing-footer";
import { LandingHeader } from "./landing-header";

export function LandingLayout() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <LandingHeader />

      <div className="flex-1 container mx-auto px-4 md:px-8 lg:px-16">
        <div className="flex gap-16 py-12">
          <main className="flex-1 min-w-0 flex flex-col gap-10">
            <Outlet />
          </main>
          <aside className="hidden lg:block w-52 shrink-0">
            <div className="sticky top-24">
              <TableOfContents key={pathname} />
            </div>
          </aside>
        </div>
      </div>

      <LandingFooter />
    </div>
  );
}
