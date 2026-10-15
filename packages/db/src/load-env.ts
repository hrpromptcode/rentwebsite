import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

/** Loads the monorepo root .env first, then a package-local .env (which may override). */
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });
