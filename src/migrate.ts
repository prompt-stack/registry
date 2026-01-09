/**
 * RUDI Registry v1 → v2 Migration
 *
 * Transforms v1 manifests to v2 schema format.
 *
 * v1 Legacy Clarification:
 * - bundled: true meant "RUDI-managed download" (not offline shipped)
 * - This maps to v2 delivery: "remote"
 */

import type {
  Package,
  Kind,
  Delivery,
  InstallSource,
  Install,
  Detect,
  Auth,
  Mcp,
  Requires,
  Provides,
} from "./resolver.js";

// =============================================================================
// Types
// =============================================================================

/**
 * v1 manifest shape (loose typing for migration)
 */
export interface V1Manifest {
  id?: string;
  kind?: Kind;
  name?: string;
  version?: string;
  description?: string;

  // v1 install fields
  installType?: "binary" | "npm" | "pip" | "system";
  bundled?: boolean;

  // Download fields
  download?: Record<string, string>;
  downloads?: Record<string, unknown[]>;

  // npm/pip fields
  npmPackage?: string;
  pipPackage?: string;
  package?: string;

  // Binary fields
  binary?: string;
  bins?: string[] | Record<string, { path: string }>;
  commands?: Array<{ name: string; bin: string }>;

  // Detection
  checkCommand?: string;
  detect?: Detect;

  // Auth
  requiresAuth?: boolean;
  authCommand?: string;
  authInstructions?: string;
  auth?: Auth;

  // Stack fields
  runtime?: "node" | "python" | "deno" | "bun";
  command?: string[];
  requires?: {
    binaries?: string[];
    secrets?: Array<{
      name?: string;
      key?: string;
      label?: string;
      required?: boolean;
      link?: string;
      helpUrl?: string;
      description?: string;
    }>;
    runtimes?: string[];
  };
  provides?: {
    tools?: string[];
  };
  mcp?: Mcp;

  // Metadata
  meta?: Record<string, unknown>;
  category?: string;
  tags?: string[];
  author?: string;
  license?: string;
  icon?: string;

  // Install instructions (v1)
  installInstructions?: Record<string, string>;

  [key: string]: unknown;
}

// =============================================================================
// Migration Mappings
// =============================================================================

const INSTALL_TYPE_TO_SOURCE: Record<string, InstallSource> = {
  binary: "download",
  npm: "npm",
  pip: "pip",
  system: "system",
};

// =============================================================================
// Migration Functions
// =============================================================================

/**
 * Migrate a v1 manifest to v2 format
 */
export function migrateV1toV2(v1: V1Manifest, inferKind?: Kind): Package {
  // Infer kind from id prefix or explicit field
  const kind = inferKindFromManifest(v1, inferKind);
  const id = v1.id ?? `${kind}:unknown`;

  // Determine delivery
  const delivery = determineDelivery(v1, kind);

  // Build install config
  const install = buildInstall(v1, kind);

  // Build detect config
  const detect = buildDetect(v1);

  // Build bins
  const bins = buildBins(v1, kind);

  // Build auth
  const auth = buildAuth(v1);

  // Build meta
  const meta = buildMeta(v1);

  // Build base package
  const pkg: Package = {
    id,
    kind,
    name: v1.name ?? extractNameFromId(id),
    version: v1.version ?? "system",
    delivery,
    install,
  };

  // Add optional fields
  if (bins && (kind === "runtime" || kind === "binary" || kind === "agent")) {
    pkg.bins = bins;
  }

  if (detect) {
    pkg.detect = detect;
  }

  if (auth) {
    pkg.auth = auth;
  }

  if (Object.keys(meta).length > 0) {
    pkg.meta = meta;
  }

  // Add installHints from v1 installInstructions
  if (v1.installInstructions) {
    pkg.installHints = {
      brew: v1.installInstructions.darwin,
      apt: v1.installInstructions.linux,
      manual: v1.installInstructions.win32 ?? v1.installInstructions.windows,
    };
  }

  // Stack-specific fields
  if (kind === "stack") {
    pkg.runtime = v1.runtime;
    pkg.requires = buildRequires(v1);
    pkg.provides = buildProvides(v1);
    pkg.mcp = buildMcp(v1);
  }

  return pkg;
}

/**
 * Infer kind from manifest
 */
function inferKindFromManifest(v1: V1Manifest, hint?: Kind): Kind {
  // Explicit kind
  if (v1.kind) return v1.kind;

  // Hint provided
  if (hint) return hint;

  // Infer from id prefix
  if (v1.id) {
    const prefix = v1.id.split(":")[0];
    if (["runtime", "binary", "agent", "stack", "prompt"].includes(prefix)) {
      return prefix as Kind;
    }
  }

  // Infer from fields
  if (v1.runtime && (v1.command || v1.mcp)) return "stack";
  if (v1.installType === "npm" && v1.authCommand?.includes("login"))
    return "agent";

  // Default to binary
  return "binary";
}

/**
 * Determine delivery policy
 */
function determineDelivery(v1: V1Manifest, kind: Kind): Delivery {
  // Stacks and prompts are always remote (catalog)
  if (kind === "stack" || kind === "prompt") {
    return "remote";
  }

  // System install type
  if (v1.installType === "system") {
    return "system";
  }

  // Everything else is remote
  return "remote";
}

/**
 * Build install configuration
 */
function buildInstall(v1: V1Manifest, kind: Kind): Install {
  // Stacks use catalog
  if (kind === "stack") {
    const [, name] = (v1.id ?? "stack:unknown").split(":");
    return {
      source: "catalog",
      path: `catalog/stacks/${name}`,
    };
  }

  // Prompts use catalog
  if (kind === "prompt") {
    const [, name] = (v1.id ?? "prompt:unknown").split(":");
    return {
      source: "catalog",
      path: `catalog/prompts/${name}.md`,
    };
  }

  // Determine source from installType
  const source: InstallSource =
    INSTALL_TYPE_TO_SOURCE[v1.installType ?? "binary"] ?? "download";

  const install: Install = { source };

  // npm/pip package
  if (source === "npm" || source === "pip") {
    install.package = v1.npmPackage ?? v1.pipPackage ?? v1.package;
  }

  // Download platforms
  if (source === "download") {
    const platforms = buildPlatforms(v1);
    if (platforms && Object.keys(platforms).length > 0) {
      install.platforms = platforms;
    }
  }

  // System platforms (for overrides like sqlite on Windows)
  if (source === "system" && v1.downloads) {
    install.platforms = buildPlatforms(v1);
  }

  return install;
}

/**
 * Build platforms configuration from v1 download/downloads
 */
function buildPlatforms(
  v1: V1Manifest
): Record<string, Record<string, unknown>> | undefined {
  // v1 uses download (singular) for simple URL mapping
  if (v1.download) {
    const platforms: Record<string, Record<string, unknown>> = {};
    for (const [key, url] of Object.entries(v1.download)) {
      platforms[key] = {
        url,
        checksum: { algo: "sha256", value: "TODO" }, // Placeholder
        extract: inferExtract(url),
      };
    }
    return platforms;
  }

  // v1 uses downloads (plural) for complex extraction config
  if (v1.downloads) {
    const platforms: Record<string, Record<string, unknown>> = {};
    for (const [key, configs] of Object.entries(v1.downloads)) {
      if (Array.isArray(configs) && configs.length > 0) {
        const first = configs[0] as Record<string, unknown>;
        platforms[key] = {
          url: first.url,
          checksum: { algo: "sha256", value: "TODO" }, // Placeholder
          extract: {
            type: first.type ?? inferExtractType(first.url as string),
            strip: first.strip,
          },
        };
      }
    }
    return platforms;
  }

  return undefined;
}

/**
 * Infer extract config from URL
 */
function inferExtract(url: string): { type: string } {
  return { type: inferExtractType(url) };
}

/**
 * Infer extract type from URL
 */
function inferExtractType(url: string): string {
  if (url.endsWith(".tar.gz") || url.endsWith(".tgz")) return "tar.gz";
  if (url.endsWith(".tar.xz")) return "tar.xz";
  if (url.endsWith(".zip")) return "zip";
  return "raw";
}

/**
 * Build detect configuration
 */
function buildDetect(v1: V1Manifest): Detect | undefined {
  if (v1.detect) return v1.detect;

  if (v1.checkCommand) {
    return {
      command: v1.checkCommand,
      expectExitCode: 0,
    };
  }

  return undefined;
}

/**
 * Build bins configuration
 */
function buildBins(
  v1: V1Manifest,
  kind: Kind
): string[] | Record<string, { path: string }> | undefined {
  if (kind === "stack" || kind === "prompt") return undefined;

  // v1 bins field
  if (v1.bins) return v1.bins;

  // v1 commands field (array of {name, bin})
  if (v1.commands && Array.isArray(v1.commands)) {
    return v1.commands.map((c) => c.name);
  }

  // v1 binary field (single string)
  if (v1.binary) {
    return [v1.binary];
  }

  return undefined;
}

/**
 * Build auth configuration
 */
function buildAuth(v1: V1Manifest): Auth | undefined {
  if (v1.auth) return v1.auth;

  if (v1.requiresAuth || v1.authCommand) {
    return {
      required: v1.requiresAuth ?? true,
      command: v1.authCommand ?? "",
      instructions: v1.authInstructions,
    };
  }

  return undefined;
}

/**
 * Build meta configuration
 */
function buildMeta(v1: V1Manifest): Record<string, unknown> {
  const meta: Record<string, unknown> = {};

  // From v1.meta
  if (v1.meta) {
    Object.assign(meta, v1.meta);
  }

  // From top-level v1 fields
  if (v1.category && !meta.category) meta.category = v1.category;
  if (v1.tags && !meta.tags) meta.tags = v1.tags;
  if (v1.author && !meta.author) meta.author = v1.author;
  if (v1.license && !meta.license) meta.license = v1.license;
  if (v1.icon && !meta.icon) meta.icon = v1.icon;
  if (v1.description && !meta.description) meta.description = v1.description;

  return meta;
}

/**
 * Build requires configuration for stacks
 */
function buildRequires(v1: V1Manifest): Requires {
  const requires: Requires = {
    binaries: v1.requires?.binaries ?? [],
    secrets: [],
  };

  // Migrate v1 secrets format
  if (v1.requires?.secrets) {
    requires.secrets = v1.requires.secrets.map((s) => ({
      key: s.key ?? s.name ?? "",
      label: s.label ?? s.name ?? "",
      required: s.required ?? true,
      helpUrl: s.helpUrl ?? s.link,
    }));
  }

  return requires;
}

/**
 * Build provides configuration for stacks
 */
function buildProvides(v1: V1Manifest): Provides {
  return {
    tools: v1.provides?.tools ?? [],
  };
}

/**
 * Build MCP configuration for stacks
 */
function buildMcp(v1: V1Manifest): Mcp | undefined {
  if (v1.mcp) return v1.mcp;

  // Build from v1 command field
  if (v1.command && Array.isArray(v1.command) && v1.command.length > 0) {
    return {
      transport: "stdio",
      command: v1.command[0],
      args: v1.command.slice(1),
    };
  }

  return undefined;
}

/**
 * Extract name from id
 */
function extractNameFromId(id: string): string {
  const [, name] = id.split(":");
  if (!name) return id;

  // Convert kebab-case to Title Case
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// =============================================================================
// Batch Migration
// =============================================================================

/**
 * Migrate multiple v1 manifests
 */
export function migrateMany(
  manifests: Array<{ manifest: V1Manifest; kind?: Kind }>
): Package[] {
  return manifests.map(({ manifest, kind }) => migrateV1toV2(manifest, kind));
}
