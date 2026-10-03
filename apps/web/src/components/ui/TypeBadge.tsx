import type { ItemType } from "@ronneai/core";
import { Badge } from "./Badge";
import { cn } from "./cn";

/** Each type's tokens (054), spelled out so Tailwind finds every class. */
export const TYPE_CLASSES: Record<ItemType, string> = {
  skill: "border-(--type-skill-border) bg-(--type-skill-subtle) text-(--type-skill)",
  agent: "border-(--type-agent-border) bg-(--type-agent-subtle) text-(--type-agent)",
  rule: "border-(--type-rule-border) bg-(--type-rule-subtle) text-(--type-rule)",
  command: "border-(--type-command-border) bg-(--type-command-subtle) text-(--type-command)",
  hook: "border-(--type-hook-border) bg-(--type-hook-subtle) text-(--type-hook)",
  "mcp-server":
    "border-(--type-mcp-server-border) bg-(--type-mcp-server-subtle) text-(--type-mcp-server)",
  "permission-policy":
    "border-(--type-permission-policy-border) bg-(--type-permission-policy-subtle) text-(--type-permission-policy)",
  "output-style":
    "border-(--type-output-style-border) bg-(--type-output-style-subtle) text-(--type-output-style)",
  statusline:
    "border-(--type-statusline-border) bg-(--type-statusline-subtle) text-(--type-statusline)",
  "lsp-server":
    "border-(--type-lsp-server-border) bg-(--type-lsp-server-subtle) text-(--type-lsp-server)",
  bundle: "border-(--type-bundle-border) bg-(--type-bundle-subtle) text-(--type-bundle)",
};

/** A dot in each type's colour (054), for a type named in plain text: the catalogue's filter. */
export const TYPE_DOT: Record<ItemType, string> = {
  skill: "bg-(--type-skill)",
  agent: "bg-(--type-agent)",
  rule: "bg-(--type-rule)",
  command: "bg-(--type-command)",
  hook: "bg-(--type-hook)",
  "mcp-server": "bg-(--type-mcp-server)",
  "permission-policy": "bg-(--type-permission-policy)",
  "output-style": "bg-(--type-output-style)",
  statusline: "bg-(--type-statusline)",
  "lsp-server": "bg-(--type-lsp-server)",
  bundle: "bg-(--type-bundle)",
};

/**
 * An item's type as a pill in the type's own colour (054). A string that isn't a type, which a
 * broken manifest can hold, is shown in the muted badge.
 */
export const TypeBadge = ({ type, className }: { type: string; className?: string }) => {
  const classes = TYPE_CLASSES[type as ItemType];
  return classes ? (
    <Badge tone="plain" className={cn("border", classes, className)}>
      {type}
    </Badge>
  ) : (
    <Badge className={className}>{type}</Badge>
  );
};
