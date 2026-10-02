"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

const SetStatus = createContext<(message: string) => void>(() => {});

/**
 * The review queue's status line (058): what a row's decision did, said once the row has left the
 * tab. It stays mounted while the page refreshes, so the line outlives the row.
 */
export const QueueStatusProvider = ({ children }: { children: ReactNode }) => {
  const [message, setMessage] = useState("");
  return (
    <SetStatus.Provider value={setMessage}>
      <p role="status" aria-live="polite" className={message ? "pb-3 text-sm text-fg" : "sr-only"}>
        {message}
      </p>
      {children}
    </SetStatus.Provider>
  );
};

/** Says what a row's decision did; outside the provider, nothing. */
export const useQueueStatus = () => useContext(SetStatus);
