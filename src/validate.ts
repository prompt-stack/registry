/**
 * RUDI Registry v2 Manifest Validator
 *
 * Validates v2 manifests against:
 * 1. JSON Schema (AJV)
 * 2. Platform resolution (resolver)
 * 3. Effective policy (conditional rules)
 *
 * Exit codes:
 * - 0: All validations passed
 * - 1: One or more validations failed
 */

import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import Ajv from "ajv";
import addFormats from "ajv-formats";

import {
  resolve,
  assertEffectivePolicy,
  type Package,
  type ResolveContext,
} from "./resolver.js";

// Load schema (ESM with JSON import)
const schemaPath = new URL("../schemas/package.schema.json", import.meta.url);
const schema = JSON.parse(await fs.readFile(schemaPath, "utf8"));

// =============================================================================
// Platform Detection
// =============================================================================

function detectPlatform(): ResolveContext {
  const platform = process.platform;
  const arch = process.arch;

  let os: "darwin" | "linux" | "win32";
  if (platform === "darwin") os = "darwin";
  else if (platform === "linux") os = "linux";
  else if (platform === "win32") os = "win32";
  else throw new Error(`Unsupported platform: ${platform}`);

  let archNorm: "arm64" | "x64";
  if (arch === "arm64") archNorm = "arm64";
  else if (arch === "x64" || arch === "amd64") archNorm = "x64";
  else throw new Error(`Unsupported architecture: ${arch}`);

  return { os, arch: archNorm };
}

// =============================================================================
// File Utilities
// =============================================================================

async function readJson(file: string): Promise<unknown> {
  const raw = await fs.readFile(file, "utf8");
  try {
    return JSON.parse(raw);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid JSON in ${file}: ${msg}`);
  }
}

function isV2Manifest(file: string): boolean {
  // v2 directory examples + stack v2 manifest naming
  return (
    file.includes(`${path.sep}v2${path.sep}`) ||
    file.includes("/v2/") ||
    file.endsWith("manifest.v2.json")
  );
}

// =============================================================================
// Validation
// =============================================================================

interface ValidationResult {
  file: string;
  id: string;
  valid: boolean;
  errors?: string[];
}

async function validateFile(
  file: string,
  validate: ReturnType<Ajv["compile"]>,
  ctx: ResolveContext
): Promise<ValidationResult> {
  const errors: string[] = [];
  let id = "(unknown)";

  try {
    const obj = await readJson(file);
    id = (obj as Record<string, unknown>).id as string ?? "(no id)";

    // 1) Schema validation
    const valid = validate(obj);
    if (!valid) {
      const ajv = new Ajv();
      const msg = ajv.errorsText(validate.errors, { separator: "; " });
      errors.push(`Schema: ${msg}`);
      return { file, id, valid: false, errors };
    }

    // 2) Resolve for current platform
    const resolved = resolve(obj as Package, ctx);

    // 3) Effective policy validation
    assertEffectivePolicy(resolved);

    return { file, id, valid: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(msg);
    return { file, id, valid: false, errors };
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const ctx = detectPlatform();
  console.log(`Platform: ${ctx.os}-${ctx.arch}\n`);

  // Setup AJV (strict: false for conditional schemas with cross-references)
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  // Find v2 manifests
  const files = await fg(
    ["catalog/**/v2/**/*.json", "catalog/**/manifest.v2.json"],
    {
      dot: false,
      onlyFiles: true,
      cwd: process.cwd(),
    }
  );

  if (files.length === 0) {
    console.log(
      "No v2 manifests found (catalog/**/v2/**/*.json, catalog/**/manifest.v2.json)."
    );
    console.log("Create v2 manifests to validate them.");
    process.exit(0);
  }

  console.log(`Found ${files.length} v2 manifest(s)\n`);

  // Validate each file
  const results: ValidationResult[] = [];
  for (const file of files) {
    if (!isV2Manifest(file)) continue;
    const result = await validateFile(file, validate, ctx);
    results.push(result);
  }

  // Report results
  const passed = results.filter((r) => r.valid);
  const failed = results.filter((r) => !r.valid);

  for (const r of passed) {
    console.log(`✅ ${r.id}`);
    console.log(`   ${r.file}`);
  }

  for (const r of failed) {
    console.log(`\n❌ ${r.id}`);
    console.log(`   ${r.file}`);
    for (const err of r.errors ?? []) {
      console.log(`   → ${err}`);
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Results: ✅ ${passed.length} passed, ❌ ${failed.length} failed`);

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
