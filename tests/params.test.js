import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSqlParameters, formatParamValue, substituteSqlParameters } from '../public/js/params.js';

test('extracts named parameters correctly', () => {
  const sql = `
    SELECT wonum, description, status 
    FROM workorder 
    WHERE siteid = :siteid 
      AND status = :status 
      AND wonum = :wonum
  `;
  const params = extractSqlParameters(sql);
  assert.deepEqual(params, ['siteid', 'status', 'wonum']);
});

test('deduplicates parameters appearing multiple times and preserves first-seen order', () => {
  const sql = `SELECT * FROM workorder WHERE siteid = :siteid OR :siteid IS NULL OR wonum = :wonum OR parent = :wonum`;
  const params = extractSqlParameters(sql);
  assert.deepEqual(params, ['siteid', 'wonum']);
});

test('ignores colons inside single quotes and identifiers', () => {
  const sql = `
    SELECT ':not_a_param' AS col, TO_CHAR(reportdate, 'HH24:MI:SS') AS t
    FROM workorder
    WHERE siteid = :siteid AND description LIKE '%:status%'
  `;
  const params = extractSqlParameters(sql);
  assert.deepEqual(params, ['siteid']);
});

test('ignores colons inside line comments and block comments', () => {
  const sql = `
    -- WHERE ignored = :param1
    /* multi line
       comment :param2
    */
    SELECT * FROM workorder WHERE siteid = :siteid
  `;
  const params = extractSqlParameters(sql);
  assert.deepEqual(params, ['siteid']);
});

test('ignores double colons (type casting ::type)', () => {
  const sql = `SELECT col::text FROM tbl WHERE id = :id`;
  const params = extractSqlParameters(sql);
  assert.deepEqual(params, ['id']);
});

test('formats parameter values safely by type', () => {
  // String
  assert.equal(formatParamValue("BEDFORD", 'string'), "'BEDFORD'");
  assert.equal(formatParamValue("O'Connor", 'string'), "'O''Connor'");
  assert.equal(formatParamValue("'; DROP TABLE workorder; --", 'string'), "'''; DROP TABLE workorder; --'");

  // Number
  assert.equal(formatParamValue("123", 'number'), "123");
  assert.equal(formatParamValue("-45.67", 'number'), "-45.67");
  assert.throws(() => formatParamValue("123; DROP TABLE", 'number'), /không phải là số hợp lệ/);

  // Date
  assert.equal(formatParamValue("2026-10-23", 'date'), "TO_DATE('2026-10-23', 'YYYY-MM-DD')");
  assert.equal(formatParamValue("2026-10-23 15:30:00", 'date'), "TO_DATE('2026-10-23 15:30:00', 'YYYY-MM-DD HH24:MI:SS')");

  // Raw
  assert.equal(formatParamValue("SYSDATE - 1", 'raw'), "SYSDATE - 1");

  // NULL
  assert.equal(formatParamValue("", 'null'), "NULL");
});

test('substitutes parameters while preserving strings and comments', () => {
  const sql = `
    -- :siteid in comment
    SELECT ':siteid' AS literal, wonum
    FROM workorder
    WHERE siteid = :siteid AND status = :status
  `;
  const values = {
    siteid: { value: "BEDFORD", type: 'string' },
    status: { value: "APPR", type: 'string' }
  };
  const result = substituteSqlParameters(sql, values);
  assert.ok(result.includes("':siteid' AS literal"));
  assert.ok(result.includes("-- :siteid in comment"));
  assert.ok(result.includes("siteid = 'BEDFORD'"));
  assert.ok(result.includes("status = 'APPR'"));
});
