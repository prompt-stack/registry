/**
 * RUDI Extract Schema Tests
 *
 * Tests that extraction configurations in manifests are correctly validated.
 * Note: Actual archive extraction is tested in the CLI repo.
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import {
  resolve,
  assertEffectivePolicy,
  type Package,
  type ResolveContext,
} from "./resolver.js";

// =============================================================================
// Setup
// =============================================================================

let validate: ValidateFunction;

beforeAll(async () => {
  const schemaPath = path.resolve(
    import.meta.dirname,
    "../schemas/package.schema.json"
  );
  const schema = JSON.parse(await fs.readFile(schemaPath, "utf8"));

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  validate = ajv.compile(schema);
});

// =============================================================================
// Extract Configuration Tests
// =============================================================================

describe("extract configuration validation", () => {
  const baseManifest = {
    id: "binary:test",
    kind: "binary",
    name: "Test",
    version: "1.0.0",
    delivery: "remote",
    bins: ["test"],
  };

  describe("extract type", () => {
    it("should accept zip extraction", () => {
      const manifest = {
        ...baseManifest,
        install: {
          source: "download",
          platforms: {
            "darwin-arm64": {
              url: "https://example.com/test.zip",
              checksum: { algo: "sha256", value: "a".repeat(64) },
              extract: { type: "zip" },
            },
          },
        },
      };

      expect(validate(manifest)).toBe(true);
    });

    it("should accept tar.gz extraction", () => {
      const manifest = {
        ...baseManifest,
        install: {
          source: "download",
          platforms: {
            "linux-x64": {
              url: "https://example.com/test.tar.gz",
              checksum: { algo: "sha256", value: "b".repeat(64) },
              extract: { type: "tar.gz" },
            },
          },
        },
      };

      expect(validate(manifest)).toBe(true);
    });

    it("should accept tar.xz extraction", () => {
      const manifest = {
        ...baseManifest,
        install: {
          source: "download",
          platforms: {
            "linux-x64": {
              url: "https://example.com/test.tar.xz",
              checksum: { algo: "sha256", value: "c".repeat(64) },
              extract: { type: "tar.xz" },
            },
          },
        },
      };

      expect(validate(manifest)).toBe(true);
    });

    it("should accept raw (no extraction)", () => {
      const manifest = {
        ...baseManifest,
        install: {
          source: "download",
          platforms: {
            "darwin-arm64": {
              url: "https://example.com/binary",
              checksum: { algo: "sha256", value: "d".repeat(64) },
              extract: { type: "raw" },
            },
          },
        },
      };

      expect(validate(manifest)).toBe(true);
    });
  });

  describe("strip option", () => {
    it("should accept strip: 0", () => {
      const manifest = {
        ...baseManifest,
        install: {
          source: "download",
          platforms: {
            "darwin-arm64": {
              url: "https://example.com/test.zip",
              checksum: { algo: "sha256", value: "e".repeat(64) },
              extract: { type: "zip", strip: 0 },
            },
          },
        },
      };

      expect(validate(manifest)).toBe(true);
    });

    it("should accept strip: 1 (common for GitHub releases)", () => {
      const manifest = {
        ...baseManifest,
        install: {
          source: "download",
          platforms: {
            "darwin-arm64": {
              url: "https://github.com/example/repo/releases/download/v1.0.0/test.zip",
              checksum: { algo: "sha256", value: "f".repeat(64) },
              extract: { type: "zip", strip: 1 },
            },
          },
        },
      };

      expect(validate(manifest)).toBe(true);
    });

    it("should accept strip: 2", () => {
      const manifest = {
        ...baseManifest,
        install: {
          source: "download",
          platforms: {
            "darwin-arm64": {
              url: "https://example.com/nested.tar.gz",
              checksum: { algo: "sha256", value: "0".repeat(64) },
              extract: { type: "tar.gz", strip: 2 },
            },
          },
        },
      };

      expect(validate(manifest)).toBe(true);
    });

    it("should reject negative strip values", () => {
      const manifest = {
        ...baseManifest,
        install: {
          source: "download",
          platforms: {
            "darwin-arm64": {
              url: "https://example.com/test.zip",
              checksum: { algo: "sha256", value: "1".repeat(64) },
              extract: { type: "zip", strip: -1 },
            },
          },
        },
      };

      expect(validate(manifest)).toBe(false);
    });
  });

  describe("subdir option", () => {
    it("should accept subdir for nested binaries", () => {
      const manifest = {
        ...baseManifest,
        install: {
          source: "download",
          platforms: {
            "darwin-arm64": {
              url: "https://example.com/release.zip",
              checksum: { algo: "sha256", value: "2".repeat(64) },
              extract: { type: "zip", subdir: "bin" },
            },
          },
        },
      };

      expect(validate(manifest)).toBe(true);
    });

    it("should accept combined strip and subdir", () => {
      const manifest = {
        ...baseManifest,
        install: {
          source: "download",
          platforms: {
            "darwin-arm64": {
              url: "https://example.com/release.zip",
              checksum: { algo: "sha256", value: "3".repeat(64) },
              extract: { type: "zip", strip: 1, subdir: "bin" },
            },
          },
        },
      };

      expect(validate(manifest)).toBe(true);
    });
  });
});

// =============================================================================
// Platform-specific Extract Tests
// =============================================================================

describe("platform-specific extract resolution", () => {
  const ctx: ResolveContext = { os: "darwin", arch: "arm64" };

  it("should resolve platform-specific extract config", () => {
    const manifest: Package = {
      id: "binary:ffmpeg",
      kind: "binary",
      name: "FFmpeg",
      version: "7.1",
      delivery: "remote",
      install: {
        source: "download",
        platforms: {
          "darwin-arm64": {
            url: "https://evermeet.cx/ffmpeg/ffmpeg-7.1.zip",
            checksum: { algo: "sha256", value: "a".repeat(64) },
            extract: { type: "zip" },
          },
          "linux-x64": {
            url: "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
            checksum: { algo: "sha256", value: "b".repeat(64) },
            extract: { type: "tar.xz", strip: 1 },
          },
        },
      },
      bins: { ffmpeg: { path: "ffmpeg" } },
      detect: { command: "ffmpeg -version" },
    };

    const resolved = resolve(manifest, ctx);

    expect(resolved._resolved.platformKey).toBe("darwin-arm64");
    expect(resolved._resolved.platform?.extract?.type).toBe("zip");
  });

  it("should validate extract config for all platforms", () => {
    const manifest: Package = {
      id: "binary:test",
      kind: "binary",
      name: "Test",
      version: "1.0.0",
      delivery: "remote",
      install: {
        source: "download",
        platforms: {
          "darwin-arm64": {
            url: "https://example.com/test-darwin-arm64.zip",
            checksum: { algo: "sha256", value: "a".repeat(64) },
            extract: { type: "zip" },
          },
          "darwin-x64": {
            url: "https://example.com/test-darwin-x64.zip",
            checksum: { algo: "sha256", value: "b".repeat(64) },
            extract: { type: "zip" },
          },
          "linux-x64": {
            url: "https://example.com/test-linux-x64.tar.gz",
            checksum: { algo: "sha256", value: "c".repeat(64) },
            extract: { type: "tar.gz", strip: 1 },
          },
          "win32-x64": {
            url: "https://example.com/test-win32-x64.zip",
            checksum: { algo: "sha256", value: "d".repeat(64) },
            extract: { type: "zip", strip: 1 },
          },
        },
      },
      bins: ["test"],
      detect: { command: "test --version" },
    };

    // Validate schema
    expect(validate(manifest)).toBe(true);

    // Validate policy for each platform
    const platforms: ResolveContext[] = [
      { os: "darwin", arch: "arm64" },
      { os: "darwin", arch: "x64" },
      { os: "linux", arch: "x64" },
      { os: "win32", arch: "x64" },
    ];

    for (const p of platforms) {
      const resolved = resolve(manifest, p);
      expect(() => assertEffectivePolicy(resolved)).not.toThrow();
      expect(resolved._resolved.platform?.extract).toBeDefined();
    }
  });
});

// =============================================================================
// Common Archive Patterns
// =============================================================================

describe("common archive patterns", () => {
  it("should handle GitHub release pattern (strip: 1)", () => {
    const manifest = {
      id: "binary:ripgrep",
      kind: "binary",
      name: "ripgrep",
      version: "14.1.0",
      delivery: "remote",
      install: {
        source: "download",
        platforms: {
          "darwin-arm64": {
            url: "https://github.com/BurntSushi/ripgrep/releases/download/14.1.0/ripgrep-14.1.0-aarch64-apple-darwin.tar.gz",
            checksum: { algo: "sha256", value: "e".repeat(64) },
            extract: { type: "tar.gz", strip: 1 },
          },
        },
      },
      bins: ["rg"],
      detect: { command: "rg --version" },
    };

    expect(validate(manifest)).toBe(true);
  });

  it("should handle flat zip (no strip)", () => {
    const manifest = {
      id: "binary:tool",
      kind: "binary",
      name: "Tool",
      version: "1.0.0",
      delivery: "remote",
      install: {
        source: "download",
        platforms: {
          "darwin-arm64": {
            url: "https://example.com/tool.zip",
            checksum: { algo: "sha256", value: "f".repeat(64) },
            extract: { type: "zip" },
          },
        },
      },
      bins: ["tool"],
    };

    expect(validate(manifest)).toBe(true);
  });

  it("should handle single binary (raw)", () => {
    const manifest = {
      id: "binary:binary-only",
      kind: "binary",
      name: "Binary Only",
      version: "1.0.0",
      delivery: "remote",
      install: {
        source: "download",
        platforms: {
          "darwin-arm64": {
            url: "https://example.com/binary-darwin-arm64",
            checksum: { algo: "sha256", value: "0".repeat(64) },
            extract: { type: "raw" },
          },
        },
      },
      bins: ["binary-only"],
    };

    expect(validate(manifest)).toBe(true);
  });
});
