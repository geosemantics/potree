export default [
	{
		input: 'src/Potree.js',
		treeshake: false,
		output: {
			file: 'build/potree/potree.js',
			format: 'umd',
			name: 'Potree',
			sourcemap: true,
		}
	},{
		// SVX: SVX extension bundle — exposes all SVX classes as window.SVX
		input: 'src/svx/SVXPotree.js',
		treeshake: false,
		output: {
			file: 'build/potree/svx.js',
			format: 'umd',
			name: 'SVX',
			sourcemap: true,
			globals: {
				// Assume THREE and Potree are already loaded as globals
				'../../libs/three.js/build/three.module.js': 'THREE',
			}
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