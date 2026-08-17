import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { fileURLToPath } from "node:url";

config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set to run Drizzle Kit.");
}

export default defineConfig({
  dialect: "cockroach",
  dbCredentials: {
    url: databaseUrl,
  },
});
