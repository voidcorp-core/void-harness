#!/usr/bin/env node
// Entry point for the voidcorp-harness CLI.
import { main } from '../dist/main.js';

main(process.argv.slice(2)).catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
