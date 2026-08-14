import { defineConfig } from "@eddeee888/gcg-typescript-resolver-files";

const config = {
  schema: "**/schema.graphql",
  generates: {
    "src/schema": defineConfig(),
  },
};
export default config;
