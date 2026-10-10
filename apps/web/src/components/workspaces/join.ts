/** A workspace's join page (094): the link root or its moderators send for a private one. */
export const joinPath = (name: string) => `/workspaces/${encodeURIComponent(name)}/join`;
