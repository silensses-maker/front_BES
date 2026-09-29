import avispaLogo from "@/shared/assets/logos/AVISPA.jpg";
import cnrsLogo from "@/shared/assets/logos/Cnrs-logo.svg";
import javerianaLogo from "@/shared/assets/logos/javeriana.png";
import promuevaLogo from "@/shared/assets/logos/promueva.svg";
import univalleLogo from "@/shared/assets/logos/univalle.svg";

/**
 * Partner institutions whose logos appear on the home page, the landing footer
 * and the login page. Adding an entry here shows it in all three places.
 */
export const PARTNERS = [
  {
    id: "univalle",
    src: univalleLogo,
    alt: "Universidad del Valle",
    href: "https://www.univalle.edu.co/",
  },
  {
    id: "promueva",
    src: promuevaLogo,
    alt: "PROMUEVA",
    href: "https://sites.google.com/view/promueva/",
  },
  {
    id: "avispa",
    src: avispaLogo,
    alt: "AVISPA",
    href: "https://eisc.univalle.edu.co/index.php/grupos-investigacion/avispa",
  },
  {
    id: "javeriana",
    src: javerianaLogo,
    alt: "Pontificia Universidad Javeriana",
    href: "https://www.javerianacali.edu.co/",
  },
  {
    id: "cnrs",
    src: cnrsLogo,
    alt: "CNRS",
    href: "https://www.cnrs.fr/",
  },
] as const;

export type PartnerId = (typeof PARTNERS)[number]["id"];
