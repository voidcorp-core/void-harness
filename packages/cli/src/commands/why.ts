import { buildProjectGraph } from '@voidcorp/harness-graph/project';
import {
	projectWhyTarget,
	renderProjectWhy,
	whyText,
} from '../lib/project-why.js';
import { banner, blank, c, footer, line } from '../lib/render.js';

function problem(message: string, fix: string, code: 1 | 2): never {
	line(`  ${c.red(whyText(message))}`);
	line(`  ${c.dim(`-> ${whyText(fix)}`)}`);
	footer(c.red('why failed.'));
	process.exit(code);
}
/** Always observe incrementally; an existing knowledge artifact cannot prove freshness. */
export async function why(
	args: readonly string[],
	build: typeof buildProjectGraph = buildProjectGraph,
): Promise<void> {
	const root = process.cwd();
	const target = projectWhyTarget(root, args);
	if (!target.ok) problem(target.problem, target.fix, 2);
	banner('why');
	blank();
	let observed: Awaited<ReturnType<typeof buildProjectGraph>>;
	try {
		observed = await build({ root });
	} catch (error) {
		problem(
			'could not build the project graph',
			`run from a project root; underlying cause: ${error instanceof Error ? error.message : String(error)}`,
			1,
		);
	}
	const report = renderProjectWhy(observed, target.path);
	for (const answer of report.lines) line(`  ${answer}`);
	if (report.exitCode !== 0)
		problem(
			'why target was not found',
			'use an existing project file',
			report.exitCode,
		);
}
