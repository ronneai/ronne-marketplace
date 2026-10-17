import { encode, renderSVG } from "uqr";

/**
 * How Ronne draws an enrolment QR code (feature 105): error correction M (a phone camera reads it
 * at an angle), and the four-module quiet zone the QR standard asks for. Black on white in both
 * themes, not the design tokens: scanners need dark modules on a light background.
 */
const OPTIONS = { ecc: "M", border: 4 } as const;

/**
 * The QR code for an `otpauth://` URI, as an SVG document drawn on the server: the secret never
 * goes to a third party or into a script. Its size comes from its `viewBox`, so CSS sets it.
 */
export const qrSvg = (uri: string): string =>
  renderSVG(uri, { ...OPTIONS, pixelSize: 1, whiteColor: "#ffffff", blackColor: "#000000" });

/** The modules `qrSvg` draws, quiet zone included: for tests that read a drawing back. */
export const qrModules = (uri: string): boolean[][] => encode(uri, OPTIONS).data;
