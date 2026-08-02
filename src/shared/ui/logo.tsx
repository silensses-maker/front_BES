import { cn } from "@/shared/lib/utils";

/**
 * SiLEnSeSS brand mark — four nodes in constellation, agents with different
 * degrees of participation (see `.context/new-logo/Logo SiLEnSeSS.dc.html`).
 *
 * Single-tint variant inheriting `currentColor`: defaults to `text-primary`,
 * which resolves to the spec's brand blue #1d45aa on light and #5684e9 on
 * dark — theme-aware via tokens, no per-component dark overrides.
 *
 * Usage rules from the spec: minimum 20 px height, do not rotate/stretch,
 * keep a clear margin at least the diameter of the largest node.
 */
export function Logo({ className, ...props }: React.ComponentPropsWithoutRef<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 30 30"
      role="img"
      aria-label="SiLEnSeSS"
      className={cn("text-primary", className)}
      {...props}
    >
      <circle cx="8" cy="9" r="3" fill="currentColor" />
      <circle cx="19.5" cy="5.5" r="2.5" fill="currentColor" opacity="0.75" />
      <circle cx="15.5" cy="18.5" r="3.5" fill="currentColor" opacity="0.55" />
      <circle cx="23.5" cy="20.5" r="2.5" fill="currentColor" opacity="0.85" />
    </svg>
  );
}
