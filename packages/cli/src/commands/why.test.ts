import { expect, it, vi } from 'vitest';
import { why } from './why.js';
it('refuses arity, options and escaping paths without invoking the builder', async () => {
	const build = vi.fn(async () => {
		throw new Error('must not build');
	});
	const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
	const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
		throw new Error('exit');
	});
	try {
		for (const args of [[], ['--json'], ['a', 'b'], ['../outside']]) {
			await expect(why(args, build)).rejects.toThrow('exit');
			expect(exit).toHaveBeenLastCalledWith(2);
		}
		expect(build).not.toHaveBeenCalled();
	} finally {
		output.mockRestore();
		exit.mockRestore();
	}
});
it('renders the actionable build cause and exits one when no graph is available', async () => {
	let rendered = '';
	const output = vi
		.spyOn(process.stdout, 'write')
		.mockImplementation((chunk) => {
			rendered += String(chunk);
			return true;
		});
	const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
		throw new Error('exit');
	});
	try {
		await expect(
			why(['src/a.ts'], async () => {
				throw new Error('project root disappeared');
			}),
		).rejects.toThrow('exit');
		expect(exit).toHaveBeenCalledWith(1);
		expect(rendered).toContain('project root disappeared');
		expect(rendered).toContain('run from a project root');
	} finally {
		output.mockRestore();
		exit.mockRestore();
	}
});
