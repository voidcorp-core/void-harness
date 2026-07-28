import { alpha, type CorePort } from '@fixture/core/index.js';
import { alpha as rootAlpha } from '@fixture/core';

export const loadSecondary = async (): Promise<CorePort> => {
	const secondary = await import('@fixture/core/secondary.js');
	return { value: `${alpha()}:${rootAlpha()}:${secondary.beta()}` };
};
