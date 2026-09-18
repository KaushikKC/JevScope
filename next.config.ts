import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module: it must stay external to the bundle.
  serverExternalPackages: ["better-sqlite3"],
  // Pins the workspace root so Turbopack does not walk up to the home directory
  // looking for a lockfile.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
