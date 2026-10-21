/**
 * TeX placeholders typeset by MathJax (loaded on demand by the wiki, see shared/lib/load-mathjax).
 * Until MathJax runs — or if it cannot load — the raw TeX stays readable in place.
 */

/** Inline math — pass raw TeX without delimiters */
export const Mi = ({ tex }: { tex: string }) => (
  <span dangerouslySetInnerHTML={{ __html: `\\(${tex}\\)` }} />
);

/** Display (block) math — pass raw TeX without delimiters */
export const Mb = ({ tex }: { tex: string }) => (
  <span dangerouslySetInnerHTML={{ __html: `$$${tex}$$` }} />
);
