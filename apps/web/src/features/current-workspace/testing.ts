import { viewedWorkspace, withWorkspace } from "./current-workspace";

/**
 * A stand-in for the shell's `workspaceView` in page tests (120): the real rule over a current
 * workspace the test sets, with a redirect thrown as an error naming its target.
 */
export const fakeWorkspaceView =
  (shell: { current: string | null }) =>
  async (path: string, params: Record<string, string | string[] | undefined>) => {
    const view = viewedWorkspace(params.workspace, shell.current);
    if (view.redirect && view.workspace)
      throw new Error(`REDIRECT ${withWorkspace(path, params, view.workspace)}`);
    const keepAll = shell.current !== null;
    const fixed: Record<string, string> = view.workspace
      ? { workspace: view.workspace }
      : keepAll
        ? { workspace: "" }
        : {};
    return { workspace: view.workspace, keepAll, fixed, workspaces: [] };
  };
