import "server-only";

import path from "node:path";
import { z } from "zod";

import { createRedisFamilyStore } from "./family-store-redis.ts";
import { createFileFamilyStore } from "./family-store-file.ts";

// Match env.js's treatment of empty optional settings.
/**
 * Treat an empty optional environment setting as absent, matching runtime
 * environment validation.
 */
function optionalSetting(value: string | undefined) {
  return value === "" ? undefined : value;
}

/**
 * Select the family store for the supplied environment without reading or
 * initializing it.
 *
 * On Vercel, require a valid deployment scope and Redis configuration and
 * reject a local-file override. Elsewhere use FAMILY_DATA_FILE or
 * .data/family.json, even if hosted Redis credentials are available, so local
 * family edits remain local.
 */
export function familyStore(variables: NodeJS.ProcessEnv = process.env) {
  if (variables.VERCEL === "1") {
    const environment = z
      .enum(["production", "preview", "development"])
      .parse(variables.VERCEL_ENV);
    if (variables.FAMILY_DATA_FILE)
      throw new Error("FAMILY_DATA_FILE is only supported outside Vercel.");
    return createRedisFamilyStore({
      environment,
      instanceId: optionalSetting(variables.FAMILY_INSTANCE_ID) ?? "main",
      url: variables.KV_REST_API_URL ?? "",
      token: variables.KV_REST_API_TOKEN ?? "",
    });
  }

  const file = path.resolve(
    optionalSetting(variables.FAMILY_DATA_FILE) ?? ".data/family.json",
  );
  return createFileFamilyStore(file);
}

/**
 * Read the selected store's current document, returning null when uninitialized
 * and propagating storage failures.
 */
export async function readFamilyDocument(
  variables: NodeJS.ProcessEnv = process.env,
) {
  return familyStore(variables).read();
}
