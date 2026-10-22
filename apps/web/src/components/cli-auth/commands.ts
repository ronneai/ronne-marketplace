/**
 * The command lines for using `rmk` with this instance, shared by the CLI panel (sign-in page and
 * Access tokens, 022) and Home's Getting started (126), so the address and the flags never differ.
 * `registry` is the instance's public URL; without it the lines say `<url>`.
 */
export const rmkCommands = (registry?: string) => {
  const at = registry ? ` --registry ${registry}` : " --registry <url>";
  return {
    install: "npm install --global @ronneai/rmk",
    login: `rmk login${at}`,
    loginToken: `rmk login${at} --token <token>`,
    loginWeb: `rmk login${at} --web`,
    whoami: "rmk whoami",
    installItem: "rmk install @scope/name",
  };
};
