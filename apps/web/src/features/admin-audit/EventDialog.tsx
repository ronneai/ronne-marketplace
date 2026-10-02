"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Dialog } from "@/components/ui/Dialog";

/**
 * An audit event's details in a dialog (060). It's open because the URL says `?event=`: closing
 * goes back to the same view without it, keeping the filters, sort and page, and the scroll.
 */
export const EventDialog = ({
  title,
  closeHref,
  children,
}: {
  title: string;
  closeHref: string;
  children: ReactNode;
}) => {
  const router = useRouter();
  return (
    <Dialog open title={title} onClose={() => router.push(closeHref, { scroll: false })}>
      {children}
    </Dialog>
  );
};
