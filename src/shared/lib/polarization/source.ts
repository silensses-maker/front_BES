/**
 * Polarization (#129) — the pol_measures commit the backend computes with, for the wiki's
 * attribution (public page: it cannot ask the authenticated catalog). The backend pins the package
 * in its Dockerfile (`ARG POL_MEASURES_REF`); keep `commit` equal to it when bumping (README,
 * "Polarization measures"). The run charts show the commit the server reports instead.
 */
export const POL_MEASURES_SOURCE = {
  repository: "https://github.com/ulvenforst/pol_measures",
  commit: "0e05564ed0b7b23de368dd19becac3a1de4ef745",
  shortCommit: "0e05564",
  author: "Juan Camilo Narváez Tascón",
  bipolCredit: "Carlos Pinzón",
  paper: "arXiv:2606.13997",
} as const;
