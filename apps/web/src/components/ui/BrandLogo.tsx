/**
 * The full Ronne AI brand: the monogram and the wordmark, from the brand's SVG (feature 032). The
 * wordmark is live text in the app's own Manrope, as in the brand file. The stem and "ronne" take
 * the text colour, and the corner and "AI" the accent, so it follows the theme.
 */
export const BrandLogo = ({ height = 32, className }: { height?: number; className?: string }) => {
  return (
    <svg
      viewBox="0 0 430.91 122.5"
      width={(height * 430.91) / 122.5}
      height={height}
      className={className}
      role="img"
      aria-label="Ronne AI"
    >
      <path
        className="fill-current"
        d="M33.74,62.38l-.27,31.65h-15.34s-.13-26.46-.13-26.46c-.06-12.04,3.16-23.57,10.99-32.71,7.66-8.93,18.12-14.03,29.92-14.99l16.09-.2v15.36s-12.93.03-12.93.03c-14.95.3-27.62,11.92-28.32,27.31Z"
      />
      <path
        className="fill-accent"
        d="M18.73,43.38c-1.98.68-3.76.49-5.76.19l.06-23.64,22.09-.05c.42,1.58.29,3.04.08,4.79-7.99,3.37-14.21,9.99-16.48,18.71Z"
      />
      <text
        x="95.28"
        y="92.48"
        className="fill-current font-sans"
        fontSize="103.25"
        fontWeight={400}
      >
        ronne
      </text>
      <text
        transform="translate(388.39 92.48) scale(.92 1)"
        className="fill-accent font-sans"
        fontSize="40"
        fontWeight={600}
      >
        AI
      </text>
    </svg>
  );
};
