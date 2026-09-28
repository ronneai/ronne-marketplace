/** Where a file, and one of its lines, is on the review page's All files view (feature 014). */
export const fileAnchor = (path: string) => `file-${encodeURIComponent(path).replace(/%/g, "")}`;
export const lineAnchor = (path: string, line: number) => `${fileAnchor(path)}-L${line}`;
