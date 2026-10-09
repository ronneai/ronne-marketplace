import { LocalTime } from "@/components/ui/LocalTime";
import { Table, Td, Th } from "@/components/ui/Table";
import { ApproveForm, DeclineButton } from "./AnswerControls";
import type { RequestRow } from "./types";

/**
 * Open requests to join (094), oldest first: who, when, their message, and Approve or Decline.
 * `showWorkspace` adds the workspace column: the Requests page lists every workspace the reader
 * answers in; a workspace's own Requests tab doesn't need it.
 */
export const RequestsTable = ({
  requests,
  total,
  showWorkspace = false,
}: {
  requests: RequestRow[];
  total: number;
  showWorkspace?: boolean;
}) => {
  if (requests.length === 0)
    return (
      <p className="rounded-panel border border-hairline bg-surface p-4 text-sm text-muted">
        No requests waiting.
      </p>
    );
  return (
    <div className="grid gap-2">
      <Table>
        <thead>
          <tr>
            <Th>Who</Th>
            {showWorkspace ? <Th>Workspace</Th> : null}
            <Th>Asked (UTC)</Th>
            <Th>Message</Th>
            <Th>
              <span className="sr-only">Answer</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <Td className="py-2">
                <span className="block text-sm text-fg">{r.name}</span>
                <span className="block font-mono text-xs text-muted">{r.email}</span>
              </Td>
              {showWorkspace ? <Td mono>{r.workspace}</Td> : null}
              <Td className="whitespace-nowrap">
                <LocalTime value={r.createdAt} />
              </Td>
              <Td className="max-w-80 py-2 text-sm break-words whitespace-pre-line">
                {r.message ?? <span className="text-muted">None</span>}
              </Td>
              <Td className="py-2">
                <div className="flex flex-wrap items-start gap-2">
                  <ApproveForm request={r} />
                  <DeclineButton request={r} />
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {total > requests.length ? (
        <p className="text-xs text-muted">
          The {requests.length} oldest of {total}. Answer these to see the rest.
        </p>
      ) : null}
    </div>
  );
};
