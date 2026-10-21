/** A page's `<title>`: its parts, then the product (feature 130), as every page writes it. */
export const pageTitle = (...parts: string[]) =>
  `${[...parts, "Ronne AI Marketplace"].join(" · ")}`;
