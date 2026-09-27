/** Shown on every page until `pnpm run setup` has configured the instance (feature 005). */
export function SetupRequired() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">This instance isn&apos;t set up yet</h1>
      <p className="text-neutral-600">
        Ronne needs a database and a root account before it can be used. Run setup where Ronne is
        installed, then restart it.
      </p>
      <dl className="grid gap-2 text-sm">
        <dt className="font-medium">From a clone</dt>
        <dd>
          <code className="rounded bg-neutral-100 px-2 py-1">pnpm run setup</code>
        </dd>
        <dt className="font-medium">With Docker</dt>
        <dd>
          <code className="rounded bg-neutral-100 px-2 py-1">
            docker compose exec web pnpm run setup
          </code>
        </dd>
      </dl>
    </main>
  );
}
