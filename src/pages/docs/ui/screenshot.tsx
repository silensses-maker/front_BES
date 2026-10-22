import { ImageOff } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { useTranslation } from "@/shared/i18n";
import { screenshotSrc, screenshotTheme } from "../lib/screenshot";
import { docLang } from "../model/sections";

interface ScreenshotProps {
  /** Slot name: the file is `public/docs/<lang>/<theme>/<name>.webp`. */
  name: string;
  /** What the screenshot shows; also the text of the pending frame. */
  alt: string;
  caption?: string;
}

/**
 * A screenshot of the interface in the language being read and the current theme (light / dark
 * variants). Until its file exists, a "screenshot pending" frame stands in its place, with what it
 * will show and the file it expects. Switching language or theme tries the new file.
 */
export function Screenshot({ name, alt, caption }: ScreenshotProps) {
  const { t, i18n } = useTranslation();
  const { resolvedTheme } = useTheme();
  const src = screenshotSrc(name, docLang(i18n.language), screenshotTheme(resolvedTheme));
  // Keyed by URL: another language or theme is a new file to try
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const missing = failedSrc === src;

  return (
    <figure className="my-2 flex flex-col gap-2" data-screenshot={name}>
      {missing ? (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 text-center">
          <ImageOff className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">{t("docs.screenshotPending")}</p>
          <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{alt}</p>
          <p className="font-mono text-[11px] text-muted-foreground/80">
            {t("docs.screenshotFile", { file: src })}
          </p>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          decoding="async"
          onError={() => setFailedSrc(src)}
          className="w-full rounded-xl border border-border bg-muted/30"
        />
      )}
      {caption ? (
        <figcaption className="text-xs leading-relaxed text-muted-foreground">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
