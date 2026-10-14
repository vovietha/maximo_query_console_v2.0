import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, escapeHtmlAttribute, isReadOnlyQuery } from '../public/js/utils.js';
import { state } from '../public/js/state.js';
import { activateConnection, getActiveConnection, initializeConnections, persistConnections } from '../public/js/connections.js';

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

test('migrates the previous single connection and keeps secrets out of profile storage', () => {
  const previousStorage = globalThis.localStorage;
  const store = new Map([
    ['maximo_host', 'https://maximo.example:9081'],
    ['maximo_context', 'max76'],
    ['maximo_user', 'query-user'],
  ]);
  globalThis.localStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
  };

  try {
    state.connections = [];
    state.activeConnectionId = null;
    initializeConnections();
    assert.deepEqual(getActiveConnection(), {
      id: 'default', profileId: 'default', name: 'Maximo',
      host: 'https://maximo.example:9081', context: 'max76', username: 'query-user',
    });

    state.connections.push({ id: 'draft', name: 'Draft', host: '', draft: true });
    persistConnections();
    assert.equal(JSON.parse(store.get('maximo_connection_profiles').toString()).length, 1);

    state.connections.push({ id: 'test-env', name: 'Test', host: 'https://test.example', context: 'maximo', username: 'test-user' });
    activateConnection('test-env');
    assert.equal(getActiveConnection().profileId, 'test-env');
    assert.equal(store.get('maximo_host'), 'https://test.example');
  } finally {
    globalThis.localStorage = previousStorage;
  }
});
