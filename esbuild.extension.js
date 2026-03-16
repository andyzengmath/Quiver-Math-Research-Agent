const esbuild = require('esbuild')

esbuild
  .build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    external: ['vscode', 'pdf-parse', 'canvas', '@azure/identity'],
    sourcemap: true,
    minify: false,
  })
  .then(() => {
    console.log('Extension build complete: out/extension.js')
  })
  .catch((err) => {
    console.error('Extension build failed:', err)
    process.exit(1)
  })
