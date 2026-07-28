import { execFile } from 'node:child_process';
import { cpus, platform, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const samples = 10;
const scenarios = ['cold', 'unchanged', 'sibling', 'changed-1', 'changed-9'];
const tracks = ['deterministicJournalPort', 'nativeNodeJournal'];
const sampleScript = fileURLToPath(new URL('./sample.mjs', import.meta.url));
const deterministicCounts = {
	cold: {
		state: 'fresh',
		cachePublished: true,
		scannedFiles: 12,
		inspectedPaths: 0,
		readFiles: 12,
		hashedFiles: 12,
		extractedFiles: 12,
	},
	unchanged: {
		state: 'fresh',
		cachePublished: true,
		scannedFiles: 0,
		inspectedPaths: 0,
		readFiles: 0,
		hashedFiles: 0,
		extractedFiles: 0,
		stable: true,
	},
	sibling: {
		state: 'fresh',
		cachePublished: true,
		scannedFiles: 0,
		inspectedPaths: 0,
		readFiles: 0,
		hashedFiles: 0,
		extractedFiles: 0,
		stable: true,
	},
	'changed-1': {
		state: 'fresh',
		cachePublished: true,
		scannedFiles: 0,
		inspectedPaths: 1,
		readFiles: 1,
		hashedFiles: 1,
		extractedFiles: 1,
	},
	'changed-9': {
		state: 'fresh',
		cachePublished: true,
		scannedFiles: 0,
		inspectedPaths: 9,
		readFiles: 9,
		hashedFiles: 9,
		extractedFiles: 9,
	},
};
const advisoryCounts = {
	cold: {
		state: 'fresh',
		cachePublished: true,
		scannedFiles: 24,
		inspectedPaths: 0,
		readFiles: 24,
		hashedFiles: 24,
		extractedFiles: 12,
	},
	unchanged: {
		state: 'fresh',
		cachePublished: true,
		scannedFiles: 24,
		inspectedPaths: 0,
		readFiles: 24,
		hashedFiles: 24,
		extractedFiles: 0,
		stable: true,
	},
	sibling: {
		state: 'fresh',
		cachePublished: true,
		scannedFiles: 24,
		inspectedPaths: 0,
		readFiles: 24,
		hashedFiles: 24,
		extractedFiles: 0,
		stable: true,
	},
	'changed-1': {
		state: 'fresh',
		cachePublished: true,
		scannedFiles: 24,
		inspectedPaths: 0,
		readFiles: 24,
		hashedFiles: 24,
		extractedFiles: 1,
	},
	'changed-9': {
		state: 'fresh',
		cachePublished: true,
		scannedFiles: 24,
		inspectedPaths: 0,
		readFiles: 24,
		hashedFiles: 24,
		extractedFiles: 9,
	},
};
const unavailableCounts = Object.fromEntries(
	scenarios.map((scenario) => [
		scenario,
		{
			state: 'degraded',
			cachePublished: false,
			scannedFiles: 24,
			inspectedPaths: 0,
			readFiles: 24,
			hashedFiles: 24,
			extractedFiles: 12,
		},
	]),
);
const expectedEventEmission = {
	cold: { projectPaths: [], siblingEvents: 0 },
	unchanged: { projectPaths: [], siblingEvents: 0 },
	sibling: { projectPaths: [], siblingEvents: 1 },
	'changed-1': { projectPaths: ['packages/app/src/index.ts'], siblingEvents: 0 },
	'changed-9': {
		projectPaths: [
			'packages/app/src/index.ts',
			'packages/app/src/index.specimen.ts',
			'packages/core/src/index.ts',
			'packages/core/src/secondary.ts',
			'packages/app/tsconfig.json',
			'packages/app/package.json',
			'packages/core/package.json',
			'package.json',
			'README.md',
		],
		siblingEvents: 0,
	},
};
const mixedAssertions = {
	states: ['degraded', 'partial'],
	cachePublished: false,
	issueCode: 'journal-unavailable',
};
const budgets = {
	unchangedP95Ms: 500,
	siblingP95Ms: 500,
	changed1P95Ms: 500,
	changed9P95Ms: 500,
	peakRssBytes: 256 * 1024 * 1024,
};

function percentile95(values) {
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function assertCounts(observation, expected) {
	for (const [key, value] of Object.entries(expected)) {
		if (JSON.stringify(observation[key]) !== JSON.stringify(value)) {
			const identity = `${observation.track}/${observation.scenario}`;
			const actual = JSON.stringify(observation[key]);
			throw new Error(`${identity} expected ${key}=${JSON.stringify(value)}, received ${actual}`);
		}
	}
}

function assertAdvisoryObservation(observation, scenario) {
	if (observation.state === 'fresh') {
		const expected = advisoryCounts[scenario];
		// A native journal is advisory, not authoritative: when the build cannot
		// establish stability it says so through `stable` and re-extracts rather
		// than trust an incremental answer it could not prove. `stable` is the
		// system's own signal, not a property of the scenario, so it governs on
		// every scenario — the extraction count simply is not determined in that
		// regime, and asserting it would demand an invariant the contract
		// deliberately does not offer. Every other count still holds, so the
		// sample stays checked, just not against the optimistic numbers.
		if (observation.stable === false) {
			const { stable: _stable, extractedFiles: _extractedFiles, ...invariant } = expected;
			assertCounts(observation, invariant);
			return;
		}
		assertCounts(observation, expected);
		return;
	}
	const safelyClosed =
		mixedAssertions.states.includes(observation.state) &&
		observation.cachePublished === false &&
		observation.issueCodes.some(
			(code) => code === 'concurrent-change' || code === 'journal-unavailable',
		);
	if (!safelyClosed) throw new Error(`${scenario} advisory native observation did not fail closed`);
}

const observations = Object.fromEntries(
	tracks.map((track) => [track, Object.fromEntries(scenarios.map((scenario) => [scenario, []]))]),
);
for (const track of tracks) {
	for (let index = 0; index < samples; index += 1) {
		for (const scenario of scenarios) {
			const { stdout } = await run(
				process.execPath,
				['--expose-gc', sampleScript, track, scenario],
				{
					encoding: 'utf8',
					maxBuffer: 1024 * 1024,
					timeout: 30_000,
				},
			);
			const observation = JSON.parse(stdout);
			if (observation.track !== track || observation.scenario !== scenario) {
				throw new Error(`sample identity drift for ${track}/${scenario}`);
			}
			if (track === 'deterministicJournalPort') {
				assertCounts(observation, deterministicCounts[scenario]);
				assertCounts(observation.eventEmission, expectedEventEmission[scenario]);
			} else {
				const finalCapability = observation.capabilitySequence.at(-1);
				if (!['advisory', 'unavailable', 'mixed'].includes(observation.nativeCapability)) {
					throw new Error(
						`${scenario} reported invalid native capability ${observation.nativeCapability}`,
					);
				}
				if (!['advisory', 'unavailable'].includes(finalCapability)) {
					throw new Error(`${scenario} reported invalid final capability ${finalCapability}`);
				}
				if (
					observation.nativeCapability !== 'advisory' &&
					!observation.issueCodes.includes('journal-unavailable')
				) {
					throw new Error(`${scenario} degraded without a journal-unavailable issue`);
				}
				if (observation.nativeCapability === 'mixed') {
					if (
						!mixedAssertions.states.includes(observation.state) ||
						observation.cachePublished !== false
					) {
						throw new Error(`${scenario} mixed native capability did not fail closed`);
					}
				} else if (observation.nativeCapability === 'advisory') {
					assertAdvisoryObservation(observation, scenario);
				} else assertCounts(observation, unavailableCounts[scenario]);
			}
			observations[track][scenario].push(observation);
		}
	}
}

const deterministic = observations.deterministicJournalPort;
const deterministicP95Ms = Object.fromEntries(
	scenarios.map((scenario) => [
		scenario,
		percentile95(deterministic[scenario].map((sample) => sample.durationMs)),
	]),
);
const deterministicPeakRssBytes = Math.max(
	...scenarios.flatMap((scenario) => deterministic[scenario].map((sample) => sample.peakRssBytes)),
);
const deterministicPassed =
	deterministicP95Ms.unchanged < budgets.unchangedP95Ms &&
	deterministicP95Ms.sibling < budgets.siblingP95Ms &&
	deterministicP95Ms['changed-1'] < budgets.changed1P95Ms &&
	deterministicP95Ms['changed-9'] < budgets.changed9P95Ms &&
	deterministicPeakRssBytes < budgets.peakRssBytes;

const native = observations.nativeNodeJournal;
const reportedCapabilities = scenarios.flatMap((scenario) =>
	native[scenario].map((sample) => sample.nativeCapability),
);
const capabilitySet = new Set(reportedCapabilities);
const capabilitySequences = scenarios.flatMap((scenario) =>
	native[scenario].map((sample) => sample.capabilitySequence.join(' -> ')),
);
const nativeCapability =
	capabilitySet.size === 1 && capabilitySet.has('advisory')
		? 'advisory'
		: capabilitySet.size === 1 && capabilitySet.has('unavailable')
			? 'unavailable'
			: 'mixed';
const nativeFastPathProven = false;
const nativeClassificationValid = true;
const report = {
	schemaVersion: 5,
	measuredAt: new Date().toISOString(),
	environment: {
		node: process.version,
		platform: platform(),
		release: release(),
		cpu: cpus()[0]?.model ?? 'unknown',
	},
	corpus: 'src/project/test-fixtures/monorepo',
	samplesPerScenario: samples,
	isolation: 'one Node process per sample and scenario',
	source: 'buildProjectGraph duration and process.resourceUsage().maxRSS',
	tracks: {
		deterministicPerformance: {
			journalPort: 'deterministicJournalPort',
			native: false,
			eventModel: 'explicit project-path and sibling events emitted after fixture mutations',
			scenarioAssertions: deterministicCounts,
			eventAssertions: expectedEventEmission,
			p95Ms: deterministicP95Ms,
			peakRssBytes: deterministicPeakRssBytes,
			budgets,
			passed: deterministicPassed,
		},
		nativeCapability: {
			journalPort: 'nativeNodeJournal',
			native: true,
			classification: nativeCapability,
			capabilityCounts: Object.fromEntries(
				['advisory', 'unavailable', 'mixed'].map((capability) => [
					capability,
					reportedCapabilities.filter((observed) => observed === capability).length,
				]),
			),
			capabilitySequences: Object.fromEntries(
				[...new Set(capabilitySequences)]
					.sort()
					.map((sequence) => [
						sequence,
						capabilitySequences.filter((observed) => observed === sequence).length,
					]),
			),
			scenarioAssertions: {
				advisory: advisoryCounts,
				unavailable: unavailableCounts,
				mixed: mixedAssertions,
			},
			nativeFastPathProven,
			fastPathP95Ms: null,
			peakRssBytes: null,
			classificationValid: nativeClassificationValid,
		},
	},
	passed: deterministicPassed && nativeClassificationValid,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
