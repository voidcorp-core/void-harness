# Engineering value campaign

This directory contains the versioned protocol input for DEV-833. It is not a
result report and it makes no certification or top-5% claim.

`cohort.json` freezes nine cells: the three real DEV-832 journeys crossed with
agent-alone, Implement, and Autopilot. The campaign starts from the same source
commit in every cell. Runtime, model, model version, effort, resource profile,
order seed, and the no-human-intervention rule are common comparability metadata.
The values in the manifest are the intended local configuration and must be
checked against the runtime before the pilot; a mismatch makes the cohort
non-comparable rather than silently updating the file.

Fixture references are relative to `apps/eval-harness/fixtures/`, and their
digest is SHA-256 over the JSON encoding of the sorted `[path, content]` pairs
enumerated by the fixture loader. A changed fixture requires a new manifest and
new review; it must not silently reuse old evidence.

The protocol deliberately does not launch a paid runtime. The pilot and any
main campaign require the human gates described in the approved DEV-833 spec.
DEV-451 remains the source of any future adversarial-cohort claim; this campaign
does not duplicate that claim.
