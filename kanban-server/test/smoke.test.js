'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

test('index.js exists and is syntactically loadable', () => {
  const indexPath = path.join(__dirname, '..', 'index.js');
  assert.ok(fs.existsSync(indexPath), 'index.js missing');
  const src = fs.readFileSync(indexPath, 'utf8');
  assert.ok(src.includes('express'), 'index.js does not reference express');
});

test('package.json declares required runtime deps', () => {
  const pkg = require('../package.json');
  for (const dep of ['express', 'chokidar', 'js-yaml']) {
    assert.ok(pkg.dependencies[dep], `missing runtime dep: ${dep}`);
  }
});
