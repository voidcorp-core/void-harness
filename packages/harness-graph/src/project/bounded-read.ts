export interface BoundedReadHandle {
	read(
		buffer: Buffer,
		offset: number,
		length: number,
		position: number,
	): Promise<{ readonly bytesRead: number }>;
}

export async function readBoundedHandle(
	handle: BoundedReadHandle,
	expectedSize: number,
	maximumBytes: number,
): Promise<Buffer> {
	if (
		!Number.isSafeInteger(expectedSize) ||
		expectedSize < 0 ||
		!Number.isSafeInteger(maximumBytes) ||
		maximumBytes < 1 ||
		expectedSize > maximumBytes
	) {
		throw new Error('PROJECT_READ_INVALID: descriptor size is outside its bounded envelope');
	}
	const buffer = Buffer.alloc(expectedSize + 1);
	let offset = 0;
	while (offset < buffer.length) {
		const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
		if (!Number.isSafeInteger(bytesRead) || bytesRead < 0 || bytesRead > buffer.length - offset) {
			throw new Error('PROJECT_READ_INVALID: descriptor returned an invalid byte count');
		}
		if (bytesRead === 0) break;
		offset += bytesRead;
	}
	if (offset !== expectedSize) {
		throw new Error('PROJECT_READ_CHANGED: descriptor size changed while it was read');
	}
	return buffer.subarray(0, offset);
}
