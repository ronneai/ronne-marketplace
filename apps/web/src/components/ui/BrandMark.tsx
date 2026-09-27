/**
 * The Ronne monogram (feature 032), from the brand's SVG. The stem takes the text colour and the
 * corner the accent, so it follows the theme, including the manual toggle.
 */
export const BrandMark = ({ size = 24, className }: { size?: number; className?: string }) => {
  return (
    <svg
      viewBox="0 0 115 139.62"
      width={(size * 115) / 139.62}
      height={size}
      className={className}
      role="img"
      aria-label="Ronne"
    >
      <path
        className="fill-current"
        d="M40.67,79l-.45,52.64-25.2-.02-.22-43.99c-.1-20.03,5.19-39.19,18.06-54.39,12.58-14.85,29.76-23.33,49.14-24.93l26.43-.34v25.55s-21.24.05-21.24.05c-24.56.49-45.36,19.82-46.52,45.42Z"
      />
      <path
        className="fill-accent"
        d="M16.03,47.41c-3.25,1.13-6.18.82-9.46.31l.1-39.31,36.28-.08c.69,2.62.48,5.06.14,7.96-13.13,5.6-23.34,16.62-27.07,31.12Z"
      />
    </svg>
  );
};
