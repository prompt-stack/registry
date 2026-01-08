#!/usr/bin/env node
/**
 * SQLite MCP Server
 * Query and manage SQLite databases
 *
 * Perfect for: Local databases, app data, RUDI session database
 *
 * Usage:
 *   - As MCP: Run without args, speaks JSON-RPC
 *   - Env: SQLITE_DB_PATH=/path/to/database.db
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";
import { homedir } from "os";

// =============================================================================
// CORE API
// =============================================================================

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    let dbPath = process.env.SQLITE_DB_PATH;
    if (!dbPath) {
      throw new Error("SQLITE_DB_PATH environment variable not set");
    }
    // Expand ~ to home directory
    if (dbPath.startsWith("~")) {
      dbPath = dbPath.replace("~", homedir());
    }
    db = new Database(dbPath, { readonly: false });
    db.pragma("journal_mode = WAL");
  }
  return db;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  columns: string[];
}

export interface TableInfo {
  name: string;
  type: string;
  rowCount: number;
}

export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  dflt_value: string | null;
  pk: boolean;
}

/**
 * Run a SELECT query (read-only)
 */
export function query(sql: string, params?: unknown[]): QueryResult {
  const database = getDb();
  const stmt = database.prepare(sql);
  const rows = params ? stmt.all(...params) : stmt.all();
  const columns = stmt.columns().map((c) => c.name);
  return {
    rows: rows as Record<string, unknown>[],
    rowCount: rows.length,
    columns,
  };
}

/**
 * Execute a statement (INSERT, UPDATE, DELETE, CREATE, etc.)
 */
export function execute(
  sql: string,
  params?: unknown[]
): { changes: number; lastInsertRowid: number | bigint; message: string } {
  const database = getDb();
  const stmt = database.prepare(sql);
  const result = params ? stmt.run(...params) : stmt.run();
  return {
    changes: result.changes,
    lastInsertRowid: result.lastInsertRowid,
    message: `Executed successfully. ${result.changes} rows affected.`,
  };
}

/**
 * List all tables in the database
 */
export function listTables(): TableInfo[] {
  const database = getDb();
  const tables = database
    .prepare(
      `
    SELECT name, type FROM sqlite_master
    WHERE type IN ('table', 'view')
    AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `
    )
    .all() as { name: string; type: string }[];

  return tables.map((t) => {
    let rowCount = 0;
    try {
      const countResult = database
        .prepare(`SELECT COUNT(*) as count FROM "${t.name}"`)
        .get() as { count: number };
      rowCount = countResult.count;
    } catch {
      // Table might be a view or have issues
    }
    return {
      name: t.name,
      type: t.type,
      rowCount,
    };
  });
}

/**
 * Describe a table's columns
 */
export function describeTable(table: string): ColumnInfo[] {
  const database = getDb();
  const columns = database.prepare(`PRAGMA table_info("${table}")`).all() as {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }[];

  return columns.map((c) => ({
    cid: c.cid,
    name: c.name,
    type: c.type,
    notnull: c.notnull === 1,
    dflt_value: c.dflt_value,
    pk: c.pk === 1,
  }));
}

/**
 * Get full database schema
 */
export function getSchema(): { tables: string[]; sql: Record<string, string> } {
  const database = getDb();
  const objects = database
    .prepare(
      `
    SELECT name, sql FROM sqlite_master
    WHERE type IN ('table', 'view', 'index', 'trigger')
    AND name NOT LIKE 'sqlite_%'
    ORDER BY type, name
  `
    )
    .all() as { name: string; sql: string }[];

  const tables: string[] = [];
  const sql: Record<string, string> = {};

  for (const obj of objects) {
    tables.push(obj.name);
    if (obj.sql) {
      sql[obj.name] = obj.sql;
    }
  }

  return { tables, sql };
}

// =============================================================================
// MCP SERVER
// =============================================================================

const server = new Server(
  { name: "sqlite", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "sqlite_query",
      description:
        "Run a SELECT query on the SQLite database. Returns rows as JSON. Use ? placeholders for parameters.",
      inputSchema: {
        type: "object" as const,
        properties: {
          sql: {
            type: "string",
            description: "SQL SELECT query to execute",
          },
          params: {
            type: "array",
            items: {},
            description: "Query parameters for placeholders (?)",
          },
        },
        required: ["sql"],
      },
    },
    {
      name: "sqlite_execute",
      description:
        "Execute a SQL statement (INSERT, UPDATE, DELETE, CREATE, ALTER, DROP). Returns affected row count.",
      inputSchema: {
        type: "object" as const,
        properties: {
          sql: {
            type: "string",
            description: "SQL statement to execute",
          },
          params: {
            type: "array",
            items: {},
            description: "Query parameters for placeholders (?)",
          },
        },
        required: ["sql"],
      },
    },
    {
      name: "sqlite_list_tables",
      description:
        "List all tables and views in the database with row counts",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "sqlite_describe_table",
      description: "Get column information for a table (name, type, nullable, primary key)",
      inputSchema: {
        type: "object" as const,
        properties: {
          table: {
            type: "string",
            description: "Table name",
          },
        },
        required: ["table"],
      },
    },
    {
      name: "sqlite_schema",
      description: "Get the full database schema (CREATE statements for all objects)",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
  ],
}));

// Tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "sqlite_query": {
        const { sql, params } = args as { sql: string; params?: unknown[] };
        const result = query(sql, params);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "sqlite_execute": {
        const { sql, params } = args as { sql: string; params?: unknown[] };
        const result = execute(sql, params);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "sqlite_list_tables": {
        const result = listTables();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "sqlite_describe_table": {
        const { table } = args as { table: string };
        const result = describeTable(table);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "sqlite_schema": {
        const result = getSchema();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// =============================================================================
// STARTUP
// =============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SQLite MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
