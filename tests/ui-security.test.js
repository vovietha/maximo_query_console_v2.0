import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, escapeHtmlAttribute, isReadOnlyQuery } from '../public/js/utils.js';

test('escapes untrusted values before inserting them into HTML', () => {
  assert.equal(
    escapeHtml(`<script>alert("x")</script> & 'text'`),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;text&#39;',
  );
});

test('escapes values used in HTML attributes', () => {
  assert.equal(escapeHtmlAttribute(`col" onclick="run()&`), 'col&quot; onclick=&quot;run()&amp;');
});

test('Safe Mode accepts read-only SELECT and CTE statements', () => {
  assert.equal(isReadOnlyQuery("-- note\nSELECT 'delete', \"UPDATE\" FROM workorder"), true);
  assert.equal(isReadOnlyQuery('WITH recent AS (SELECT wonum FROM workorder) SELECT * FROM recent'), true);
});

test('Safe Mode rejects writes even inside CTEs and multiple statements', () => {
  for (const sql of ['UPDATE workorder SET status=\'X\'', 'WITH x AS (DELETE FROM workorder) SELECT * FROM x', 'SELECT 1; DELETE FROM workorder', 'SELECT \'unfinished']) {
    assert.equal(isReadOnlyQuery(sql), false, sql);
  }
});
