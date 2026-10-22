/**
 * Where Send feedback goes without JavaScript, and on a phone: the page, told which page they came
 * from. Only a path is carried (the server drops the rest), never the query of the page they are on.
 */
export const feedbackHref = (path: string): string => {
  const clean = path.split(/[?#]/, 1)[0] ?? "";
  return clean.startsWith("/feedback")
    ? "/feedback"
    : `/feedback?from=${encodeURIComponent(clean)}`;
};
