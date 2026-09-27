import Link from "next/link";

const ITEMS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/audit", label: "Audit log" },
];

/** The admin area's own navigation (feature 008), shared by every /admin page. */
export const AdminNav = ({ current }: { current: string }) => {
  return (
    <nav aria-label="Admin" className="mb-6 flex gap-1 border-b border-hairline">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={
            current === item.href || current.startsWith(`${item.href}/`) ? "page" : undefined
          }
          className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-fg aria-[current=page]:border-accent aria-[current=page]:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
};
