export default [
	{
		// SVX: use SVXPotreeBundle as the entry so SVX classes are included in
		// the main potree.js build (fixes the exports.debug error that occurred
		// when SVXPotreeRenderer was in a separate svx.js bundle).
		input: 'src/svx/SVXPotreeBundle.js',
		treeshake: false,
		output: {
			file: 'build/potree/potree.js',
			format: 'umd',
			name: 'Potree',
			sourcemap: true,
		}
	},{
		input: 'src/workers/BinaryDecoderWorker.js',
		output: {
			file: 'build/potree/workers/BinaryDecoderWorker.js',
			format: 'es',
			name: 'Potree',
			sourcemap: false
		}
	},{
		input: 'src/modules/loader/2.0/DecoderWorker.js',
		output: {
			file: 'build/potree/workers/2.0/DecoderWorker.js',
			format: 'es',
			name: 'Potree',
			sourcemap: false
		}
	},{
		// SVX: SVX decoder worker with scalar buffer interleaving support
		input: 'src/svx/modules/loader/2.0/SVXDecoderWorker.js',
		output: {
			file: 'build/potree/workers/2.0/SVXDecoderWorker.js',
			format: 'es',
			name: 'Potree',
			sourcemap: false
		}
	},{
		input: 'src/modules/loader/2.0/DecoderWorker_brotli.js',
		output: {
			file: 'build/potree/workers/2.0/DecoderWorker_brotli.js',
			format: 'es',
			name: 'Potree',
			sourcemap: false
		}
	}
]