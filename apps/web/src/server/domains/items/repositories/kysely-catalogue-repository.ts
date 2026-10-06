import { ITEM_TYPES, type ItemType } from "@ronneai/core";
import { installsIn, rendererById, supportFor } from "@ronneai/core/render";
import type { Kysely, SelectQueryBuilder } from "kysely";
import { fromDbDate, toDbBoolean, toDbDate } from "../../../db/dates";
import { decodeJson } from "../../../db/json";
import type { Database } from "../../../db/schema";
import { containsInsensitive } from "../../../db/search";
import type { DatabaseDialect } from "../../../db/url";
import type { CatalogueEntry, CatalogueFilter } from "../models/catalogue";
import type { CatalogueRepository } from "./catalogue-repository";

type Row = {
  id: string;
  workspace_name: string;
  scope_name: string;
  name: string;
  type: string;
  version: string;
  description: string;
  keywords: string;
  published_at: Date | string;
  last_published_at: Date | string | null;
  risk_flags: string | null;
  deprecated_message: string | null;
  installable: boolean | number;
  download_count: number | string;
  disabled_targets: string;
};

const toEntry = (row: Row): CatalogueEntry => ({
  id: row.id,
  workspace: row.workspace_name,
  scope: row.scope_name,
  name: row.name,
  type: row.type as ItemType,
  version: row.version,
  description: row.description,
  keywords: row.keywords ? row.keywords.split(" ") : [],
  publishedAt: fromDbDate(row.published_at),
  lastPublishedAt: fromDbDate(row.last_published_at ?? row.published_at),
  risky: (decodeJson<unknown[]>(row.risk_flags) ?? []).length > 0,
  deprecatedMessage: row.deprecated_message,
  installable: Boolean(row.installable),
  downloadCount: Number(row.download_count),
  support: supportFor(row.type, row.disabled_targets.split(" ").filter(Boolean)),
});

export const kyselyCatalogueRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): CatalogueRepository => {
  const listed = () =>
    db
      .selectFrom("items")
      .innerJoin("scopes", "scopes.id", "items.scope_id")
      .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
      .innerJoin("item_versions", "item_versions.id", "items.listed_version_id");

  const filtered = <O>(
    query: SelectQueryBuilder<
      Database & Record<string, never>,
      "items" | "scopes" | "workspaces" | "item_versions",
      O
    >,
    {
      search,
      type,
      types,
      scope,
      workspace,
      tool,
      installable,
      listedNotYanked,
      ownerId,
    }: CatalogueFilter,
  ) => {
    let q = query;
    // An item's name as people write it (056): `@team/re` is scope `team` and a name with `re`;
    // a single word also matches the scope.
    const words = search?.replace(/^@/, "") ?? "";
    const slash = words.indexOf("/");
    if (words && slash >= 0) {
      const [scopePart, namePart] = [words.slice(0, slash), words.slice(slash + 1)];
      if (scopePart) q = q.where(containsInsensitive("scopes.name", scopePart));
      if (namePart) q = q.where(containsInsensitive("items.name", namePart));
    } else if (words)
      q = q.where((eb) =>
        eb.or([
          containsInsensitive("items.name", words),
          containsInsensitive("scopes.name", words),
          containsInsensitive("item_versions.description", words),
          containsInsensitive("item_versions.keywords", words),
        ]),
      );
    if (type) q = q.where("items.type", "=", type);
    if (types)
      q = types.length ? q.where("items.type", "in", [...types]) : q.where((eb) => eb.lit(false));
    if (installable) q = q.where("items.installable", "=", toDbBoolean(true, dialect));
    if (listedNotYanked) q = q.where("item_versions.yanked_at", "is", null);
    if (scope) q = q.where("scopes.name", "=", scope);
    if (workspace) q = q.where("workspaces.name", "=", workspace);
    if (ownerId) q = q.where("items.owner_id", "=", ownerId);
    if (tool) {
      // The types the tool takes, and not turned off in the listed version's manifest (026).
      const renderer = rendererById(tool);
      const types = renderer ? ITEM_TYPES.filter((t) => installsIn(renderer.supports(t))) : [];
      q = types.length
        ? q
            .where("items.type", "in", types)
            .where("item_versions.disabled_targets", "not like", `% ${tool} %`)
        : q.where((eb) => eb.lit(false));
    }
    return q;
  };

  const entries = () =>
    listed().select([
      "items.id",
      "workspaces.name as workspace_name",
      "scopes.name as scope_name",
      "items.name",
      "items.type",
      "item_versions.version",
      "item_versions.description",
      "item_versions.keywords",
      "item_versions.published_at",
      "items.last_published_at",
      "item_versions.risk_flags",
      "item_versions.deprecated_message",
      "items.installable",
      "items.download_count",
      "item_versions.disabled_targets",
    ]);

  return {
    list: async ({ sort, after, limit, ...filter }) => {
      let query = filtered(entries(), filter).orderBy("items.installable", "desc").limit(limit);
      query =
        sort === "recent"
          ? query.orderBy("items.last_published_at", "desc").orderBy("items.id", "desc")
          : sort === "installs"
            ? query.orderBy("items.download_count", "desc").orderBy("items.id", "desc")
            : query.orderBy("scopes.name").orderBy("items.name");
      if (after) {
        const installable = toDbBoolean(after.installable, dialect);
        query = query.where((eb) =>
          eb.or([
            eb("items.installable", "<", installable),
            eb.and([
              eb("items.installable", "=", installable),
              after.sort === "recent"
                ? eb.or([
                    eb(
                      "items.last_published_at",
                      "<",
                      toDbDate(new Date(after.lastPublishedAt), dialect),
                    ),
                    eb.and([
                      eb(
                        "items.last_published_at",
                        "=",
                        toDbDate(new Date(after.lastPublishedAt), dialect),
                      ),
                      eb("items.id", "<", after.id),
                    ]),
                  ])
                : after.sort === "installs"
                  ? eb.or([
                      eb("items.download_count", "<", after.installs),
                      eb.and([
                        eb("items.download_count", "=", after.installs),
                        eb("items.id", "<", after.id),
                      ]),
                    ])
                  : eb.or([
                      eb("scopes.name", ">", after.scope),
                      eb.and([
                        eb("scopes.name", "=", after.scope),
                        eb("items.name", ">", after.name),
                      ]),
                    ]),
            ]),
          ]),
        );
      }
      return (await query.execute()).map(toEntry);
    },

    byNames: async (names) =>
      names.length === 0
        ? []
        : (
            await entries()
              .where((eb) =>
                eb.or(
                  names.map(({ scope, name }) =>
                    eb.and([eb("scopes.name", "=", scope), eb("items.name", "=", name)]),
                  ),
                ),
              )
              .execute()
          ).map(toEntry),

    typeCounts: async (filter) =>
      (
        await filtered(
          listed().select((eb) => ["items.type", eb.fn.countAll().as("count")]),
          filter,
        )
          .groupBy("items.type")
          .execute()
      ).map((row) => ({ type: row.type, count: Number(row.count) })),

    scopes: async () =>
      (await listed().select("scopes.name").distinct().orderBy("scopes.name").execute()).map(
        (row) => row.name,
      ),

    workspaces: async () =>
      (
        await db
          .selectFrom("workspaces")
          .select("name")
          .orderBy("is_global", "desc")
          .orderBy("name")
          .execute()
      ).map((row) => row.name),

    mostUsed: async (limit) =>
      (
        await entries()
          .where("items.installable", "=", toDbBoolean(true, dialect))
          .where("items.download_count", ">", 0)
          .orderBy("items.download_count", "desc")
          .orderBy("items.id")
          .limit(limit)
          .execute()
      ).map(toEntry),
  };
};
