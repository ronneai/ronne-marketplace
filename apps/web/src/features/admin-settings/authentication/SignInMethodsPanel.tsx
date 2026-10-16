import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { Table, Td, Th } from "@/components/ui/Table";

/** One way to sign in, as the panel lists it (122; 105 and 106 add theirs). */
export type SignInMethod = { name: string; on: boolean; note: string };

/** How people can sign in today: email and password, the only method until 105 and 106. */
export const SIGN_IN_METHODS: readonly SignInMethod[] = [
  {
    name: "Email and password",
    on: true,
    note: "Root can always sign in with a password, so a broken identity provider can't lock everyone out.",
  },
];

/** Admin › Settings › Authentication › Sign-in methods (122): read-only, for now. */
export const SignInMethodsPanel = ({
  methods = SIGN_IN_METHODS,
}: {
  methods?: readonly SignInMethod[];
}) => {
  return (
    <section aria-labelledby="sign-in-methods-title" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="sign-in-methods-title" className="text-base font-semibold text-fg">
          Sign-in methods
        </h2>
        <Help id="auth-methods" />
      </div>
      <p className="text-sm text-muted">How people sign in to this instance.</p>
      <Table>
        <thead>
          <tr>
            <Th>Method</Th>
            <Th>State</Th>
            <Th>Note</Th>
          </tr>
        </thead>
        <tbody>
          {methods.map((method) => (
            <tr key={method.name}>
              <Td className="font-semibold">{method.name}</Td>
              <Td>
                <Badge tone={method.on ? "accent" : "muted"}>{method.on ? "On" : "Off"}</Badge>
              </Td>
              <Td className="text-muted">{method.note}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
};
