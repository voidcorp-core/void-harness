// Deliberately vulnerable. Never imported by anything that runs.
//
// This file exists so the baseline can be proven to detect something real,
// rather than proven to run. A scanner that finds nothing on a clean tree and
// a scanner that is silently broken produce the same green.
//
// Nothing here is a credential: a fixture full of secret-shaped strings would
// make this repository's own secret scan cry wolf forever.

const { exec } = require('node:child_process');

// A01/A03 — query built by concatenation: the caller writes the SQL.
function findUser(db, name) {
  return db.query('SELECT * FROM users WHERE name = "' + name + '"');
}

// A03 — the shell gets whatever the caller sent.
function countFiles(directory, callback) {
  exec('ls ' + directory + ' | wc -l', callback);
}

module.exports = { findUser, countFiles };
