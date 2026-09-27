import {
  DummyDriver,
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import type { DatabaseDialect } from "../url";

/** A Kysely instance that only compiles SQL, for testing each dialect without a server. */
export const compileOnly = <DB>(dialect: DatabaseDialect): Kysely<DB> => {
  const parts = {
    sqlite: [SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler],
    mysql: [MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler],
    postgres: [PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler],
  } as const;
  const [Adapter, Introspector, Compiler] = parts[dialect];
  return new Kysely<DB>({
    dialect: {
      createAdapter: () => new Adapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new Introspector(db),
      createQueryCompiler: () => new Compiler(),
    },
  });
};
