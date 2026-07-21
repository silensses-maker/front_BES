import { motion, type Variants } from "motion/react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/entities/user";
import avispaLogo from "@/shared/assets/logos/AVISPA.jpg";
import javerianaLogo from "@/shared/assets/logos/javeriana.png";
import promuevaSvg from "@/shared/assets/logos/promueva.svg";
import univalleSvg from "@/shared/assets/logos/univalle.svg";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const PARTNERS = [
  { src: univalleSvg, alt: "Universidad del Valle", href: "https://www.univalle.edu.co/" },
  { src: promuevaSvg, alt: "PROMUEVA", href: "https://sites.google.com/view/promueva/" },
  {
    src: avispaLogo,
    alt: "AVISPA",
    href: "https://eisc.univalle.edu.co/index.php/grupos-investigacion/avispa",
  },
  {
    src: javerianaLogo,
    alt: "Pontificia Universidad Javeriana",
    href: "https://www.javerianacali.edu.co/",
  },
] as const;

export function HomePage() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);

  return (
    <article className="flex flex-col gap-16">
      {/* Hero — staggered */}
      <motion.section
        variants={container}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-6"
      >
        <motion.h1
          variants={item}
          className="font-display text-5xl font-normal tracking-tight text-foreground sm:text-6xl"
        >
          {t("home.headline")}
        </motion.h1>

        <motion.p
          variants={item}
          className="max-w-2xl text-lg leading-relaxed text-muted-foreground"
        >
          {t("home.subheadline")}
        </motion.p>

        {!user && (
          <motion.div variants={item}>
            <Link to="/">
              <Button size="lg">{t("home.cta")}</Button>
            </Link>
          </motion.div>
        )}

        <motion.div variants={item} className="flex flex-col gap-6 pt-8">
          <p className="text-sm font-medium text-muted-foreground">{t("home.participation")}</p>
          <div className="flex flex-wrap items-center gap-4">
            {PARTNERS.map(({ src, alt, href }) => (
              <a
                key={alt}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center rounded-md px-3 py-2 transition-opacity opacity-70 hover:opacity-100 dark:bg-white"
              >
                <img src={src} alt={alt} className="h-8 w-auto" />
              </a>
            ))}
          </div>
        </motion.div>
      </motion.section>

      {/* Introduction */}
      <section className="flex flex-col gap-4 max-w-prose">
        <h2 className="font-display text-2xl font-normal text-foreground">Introduction</h2>
        <p className="text-muted-foreground leading-relaxed">
          Opinion dynamics studies how individual beliefs evolve through social interaction.
          SiLEnSeSS lets researchers configure agent networks, choose an update rule, and observe
          how opinion distributions shift over time — all without writing code.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          The platform currently implements two foundational models: the <strong>DeGroot</strong>{" "}
          averaging model and the <strong>Spiral of Silence</strong> suppression model. Both run on
          configurable network topologies and expose per-iteration data for analysis.
        </p>
      </section>

      {/* Examples */}
      <section className="flex flex-col gap-6 max-w-prose">
        <h2 className="font-display text-2xl font-normal text-foreground">Examples</h2>
        <p className="text-muted-foreground leading-relaxed">
          The following scenarios illustrate the kinds of questions SiLEnSeSS can help answer.
        </p>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h3 className="font-sans font-semibold text-foreground">Consensus under DeGroot</h3>
            <p className="text-muted-foreground leading-relaxed">
              A 500-agent Barabási–Albert network with uniform influence weights converges to a
              shared opinion within ~300 iterations. Hub nodes dominate early; peripheral agents
              follow after sufficient exposure.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="font-sans font-semibold text-foreground">Silencing cascade</h3>
            <p className="text-muted-foreground leading-relaxed">
              In a polarized Erdős–Rényi network calibrated with 2022 Colombian election data, the
              minority cluster begins suppressing its opinion at iteration 80, producing a cascade
              that amplifies the majority position far beyond its initial share.
            </p>
          </div>
        </div>
      </section>
    </article>
  );
}
