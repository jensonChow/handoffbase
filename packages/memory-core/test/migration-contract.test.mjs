import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  MEMORY_SOURCE_KINDS,
  MEMORY_STATUSES,
  MEMORY_TYPES
} from "../dist/index.js";

const migrationUrl = new URL("../migrations/0001_memory_core.sql", import.meta.url);

async function readMigration() {
  return readFile(migrationUrl, "utf8");
}

function extractSqlCheckValues(sql, columnName) {
  const columnDefinitionIndex = sql.indexOf(`${columnName} text not null`);
  assert.notEqual(columnDefinitionIndex, -1, `missing ${columnName} text column`);

  const checkIndex = sql.indexOf(`${columnName} in`, columnDefinitionIndex);
  assert.notEqual(checkIndex, -1, `missing ${columnName} enum check`);

  const openParenIndex = sql.indexOf("(", checkIndex);
  const closeParenIndex = sql.indexOf(")", openParenIndex);
  assert.notEqual(openParenIndex, -1, `missing ${columnName} enum open paren`);
  assert.notEqual(closeParenIndex, -1, `missing ${columnName} enum close paren`);

  return [...sql.slice(openParenIndex, closeParenIndex).matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function assertSameValues(actual, expected, label) {
  assert.deepEqual([...new Set(actual)].sort(), [...expected].sort(), `${label} SQL check values must match canonical constants`);
}

test("memory migration enum checks match canonical memory constants", async () => {
  const sql = await readMigration();

  assertSameValues(extractSqlCheckValues(sql, "type"), MEMORY_TYPES, "memory type");
  assertSameValues(extractSqlCheckValues(sql, "status"), MEMORY_STATUSES, "memory status");
  assertSameValues(extractSqlCheckValues(sql, "source_kind"), MEMORY_SOURCE_KINDS, "memory source kind");
});

test("memory migration stores domain ids and references as text", async () => {
  const sql = await readMigration();

  assert.match(sql, /create table if not exists memories \(\n  id text primary key,/);
  assert.match(sql, /\n  supersedes text\[\] not null default '\{\}',/);
  assert.match(sql, /\n  superseded_by text references memories\(id\) on delete set null,/);
  assert.match(sql, /create table if not exists memory_embeddings \(\n  memory_id text primary key references memories\(id\) on delete cascade,/);
  assert.match(sql, /create table if not exists memory_events \(\n  id text primary key,\n  tenant_id text not null,\n  memory_id text references memories\(id\) on delete set null,\n  run_id text,\n  trace_id text,/);
  assert.match(sql, /create table if not exists runs \(\n  id text primary key,/);
  assert.match(sql, /create table if not exists memory_traces \(\n  id text primary key,\n  tenant_id text not null,\n  run_id text references runs\(id\) on delete set null,/);
  assert.match(sql, /\n  selected_memory_ids text\[\] not null default '\{\}',/);
  assert.match(sql, /\n  ignored_memory_ids text\[\] not null default '\{\}',/);
});
