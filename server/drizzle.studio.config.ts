import config from "./drizzle.config";

// Studio has no Cockroach dialect implementation yet; use Cockroach's PostgreSQL wire protocol.
export default {
  ...config,
  dialect: "postgresql",
};
