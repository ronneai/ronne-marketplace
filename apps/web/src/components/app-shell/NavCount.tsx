/** A count next to a nav item or on the Menu button: how many are waiting. */
export const NavCount = ({ count }: { count: number }) => (
  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-strong px-1 text-[10px] font-semibold text-on-accent">
    {count}
    <span className="sr-only"> waiting</span>
  </span>
);
