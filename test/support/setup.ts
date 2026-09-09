import { join } from 'node:path';
import { inject } from 'vitest';

const root = inject('voidTestRunRoot');
const environment = {
  HOME: join(root, 'home'),
  USERPROFILE: join(root, 'home'),
  TMPDIR: join(root, 'tmp'),
  TMP: join(root, 'tmp'),
  TEMP: join(root, 'tmp'),
  VOID_GLOBAL_DIR: join(root, 'void-global'),
  VOID_TEST_RUN_ROOT: root,
  XDG_CACHE_HOME: join(root, 'cache'),
  XDG_CONFIG_HOME: join(root, 'config'),
};

for (const [name, value] of Object.entries(environment)) {
  process.env[name] = value;
}
