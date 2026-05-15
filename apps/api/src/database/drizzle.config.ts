import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for drizzle-kit (read by db:generate / db:migrate).');
}

// drizzle-kit reads the default export.
// eslint-disable-next-line import/no-default-export
export default defineConfig({
  dialect: 'postgresql',
  // Glob over all schema files — avoids loading the barrel which uses NodeNext
  // `.js` import extensions that drizzle-kit's CJS loader cannot resolve.
  schema: ['./src/database/schemas.ts', './src/modules/**/schema/*.schema.ts'],
  out: './src/database/migrations',
  dbCredentials: { url: databaseUrl },
  verbose: true,
  strict: true,
  migrations: {
    table: 'drizzle_migrations',
    schema: 'public',
  },
});
