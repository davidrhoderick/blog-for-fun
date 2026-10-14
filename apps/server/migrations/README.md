# Database migrations

Commit every timestamped migration directory, including its `migration.sql` and
`snapshot.json` files. These files are the versioned history used to move each
database forward to the current schema.

From `server/`, use this workflow:

1. Update the Drizzle schema in `src/db/schema/`.
2. Run `pnpm run db:generate -- --name <description>`.
3. Review the generated SQL. Add explicit data-copy or backfill statements when
   a change needs to preserve or transform existing data.
4. Run `pnpm run db:check` to validate the migration history.
5. Commit the schema and generated migration together.
6. Run `pnpm run db:migrate` in the environment that should receive the change.

Migrations are forward-only. Do not edit a migration that may already have
been applied. Create a new compensating migration instead. Avoid `drizzle-kit
push` for shared databases because it changes the database without creating
committed migration history.
