#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../packages/cli/package.json', import.meta.url));
const { parseDocument } = require('yaml');

const target = Number.parseInt(process.argv[2] ?? '', 10);
const cap = Number.parseInt(process.argv[3] ?? '', 10);

if (!Number.isSafeInteger(target) || !Number.isSafeInteger(cap) || target < 1 || cap < target) {
  process.stderr.write('FAIL: invalid discovery description budget configuration\n');
  process.exitCode = 1;
} else {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  let failed = false;
  for (const path of input.split('\n').filter((candidate) => candidate !== '')) {
    try {
      const source = await readFile(path, 'utf8');
      const isSpecialist = /(^|[\\/])specialists[\\/].+\.ya?ml$/i.test(path);
      const yaml = isSpecialist
        ? source
        : /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)?.[1];
      if (yaml === undefined) throw new Error('leading YAML frontmatter is missing');

      const document = parseDocument(yaml, {
        strict: true,
        stringKeys: true,
        uniqueKeys: true,
        version: '1.2',
      });
      if (document.errors.length > 0) {
        throw new Error(document.errors.map((error) => error.message).join('; '));
      }
      const value = document.toJS({ maxAliasCount: 0 });
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('frontmatter must resolve to a mapping');
      }
      const description = value.description;
      if (typeof description !== 'string' || description.trim() === '') {
        throw new Error('description must resolve to a non-empty string');
      }

      const length = description.trim().length;
      if (length > cap) {
        process.stderr.write(`    FAIL: ${path} description is ${length} chars (cap ${cap})\n`);
        failed = true;
      } else if (length > target) {
        process.stdout.write(
          `    NOTE: ${path} description is ${length} chars (target ${target}, cap ${cap})\n`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`    FAIL: ${path} description cannot be measured (${message})\n`);
      failed = true;
    }
  }

  if (failed) process.exitCode = 1;
}
