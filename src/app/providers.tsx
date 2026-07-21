import { ThemeProvider } from "next-themes";
import { I18nextProvider } from "react-i18next";
import { i18n } from "@/shared/i18n";
import { Toaster } from "@/shared/ui/sonner";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { ProfileSheet } from "@/widgets/profile-sheet";

interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          {children}
          <Toaster />
          <ProfileSheet />
        </TooltipProvider>
      </I18nextProvider>
    </ThemeProvider>
  );
}
