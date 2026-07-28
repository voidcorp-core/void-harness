import { describe, expect, it } from 'vitest';
import { readBoundedHandle } from './bounded-read.js';

describe('bounded descriptor reader', () => {
	it('continues across short reads until the exact opened size is consumed', async () => {
		const source = Buffer.from('short reads are legal');
		const positions: number[] = [];
		const bytes = await readBoundedHandle(
			{
				read: async (buffer, offset, length, position) => {
					positions.push(position);
					const count = Math.min(3, length, source.length - position);
					if (count <= 0) return { bytesRead: 0 };
					source.copy(buffer, offset, position, position + count);
					return { bytesRead: count };
				},
			},
			source.length,
			64,
		);

		expect(bytes.toString('utf8')).toBe(source.toString('utf8'));
		expect(positions.length).toBeGreaterThan(2);
	});

	it('rejects early EOF and growth beyond the opened size', async () => {
		await expect(
			readBoundedHandle(
				{
					read: async () => ({ bytesRead: 0 }),
				},
				4,
				64,
			),
		).rejects.toThrow(/PROJECT_READ_CHANGED/);

		await expect(
			readBoundedHandle(
				{
					read: async (buffer, offset, length, position) => {
						buffer.fill(1, offset, offset + Math.min(length, 5 - position));
						return { bytesRead: Math.min(length, 5 - position) };
					},
				},
				4,
				64,
			),
		).rejects.toThrow(/PROJECT_READ_CHANGED/);
	});
});
