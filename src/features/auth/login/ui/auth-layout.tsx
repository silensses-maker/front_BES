import { ConstellationBackground } from "@/shared/ui/constellation";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen justify-center md:px-12 lg:px-0">
      <div className="relative z-10 flex flex-1 flex-col bg-card border-r border-border px-4 py-10 sm:justify-center md:flex-none md:px-28">
        <main className="mx-auto w-full max-w-md sm:px-4 md:w-96 md:max-w-sm md:px-0">
          {children}
        </main>
      </div>
      <div className="hidden sm:contents lg:relative lg:block lg:flex-1">
        <div className="absolute inset-0 h-full w-full">
          <ConstellationBackground
            className="bg-background"
            nodeColor="rgba(100, 140, 220, 0.85)"
            lineColor="rgba(100, 140, 220, 0.12)"
          />
        </div>
      </div>
    </div>
  );
}
