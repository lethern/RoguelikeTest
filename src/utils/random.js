
class CryptoRandom{
	// approx. 6 chars
	static generateId() {
		const bytes = crypto.getRandomValues(new Uint8Array(6));
		// base64url-like
		return btoa(String.fromCharCode(...bytes))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
	}
}

class SeededRandom {
	#seed;

	constructor(seed = SeededRandom.generateSeed()) {
		this.#seed = seed | 0;
	}

	static generateSeed() {
		const array = new Uint32Array(1);
		crypto.getRandomValues(array);
		return array[0];
	}

	getSeed(){
		return this.#seed;
	}

	genRange(from, to) {
		const min = Math.min(from, to);
		const max = Math.max(from, to);

		const range = max - min + 1;

		// [0, 1)
		const r = this.#generate() / 0x100000000;

		return min + Math.floor(r * range);
	}

	// SplitMix32
	#generate() {
		this.#seed = (this.#seed + 0x9e3779b9) | 0;

		let z = this.#seed;
		z ^= z >>> 16;
		z = Math.imul(z, 0x21f0aaad);
		z ^= z >>> 15;
		z = Math.imul(z, 0x735a2d97);
		z ^= z >>> 15;

		return z >>> 0;
	}
}

export {CryptoRandom, SeededRandom}