import { beta } from './secondary.js';

export interface CorePort {
	readonly value: string;
}

export const alpha = (): string => beta();
