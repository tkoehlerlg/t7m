const T7M_PREFIX = '\x1b[36m[T7M]\x1b[0m'

export const log = (message: string, data?: unknown, transformerName?: string) => {
	if (typeof process !== 'undefined' && process.env?.T7M_DEBUG !== 'true') return
	const nameTag = transformerName ? `\x1b[33m[${transformerName}]\x1b[0m` : ''
	if (data !== undefined) {
		const jsonData = typeof data === 'string' ? data : JSON.stringify(data, null, 2).substring(0, 300)
		console.log(T7M_PREFIX, nameTag, message, jsonData)
	} else {
		console.log(T7M_PREFIX, nameTag, message)
	}
}
