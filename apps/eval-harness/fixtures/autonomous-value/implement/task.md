# Implement journey fixture

Replay the real DEV-832 ticket path in an isolated consumer. Produce a tested
correction, collect the pre- and post-correction review evidence, and stop when
the delivered commit is not proved by its own diff and tests.

The fixture is a bounded task description. It contains no consumer source,
credentials, dependency lockfile, or private project data.
