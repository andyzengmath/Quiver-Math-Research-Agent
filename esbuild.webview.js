const esbuild = require('esbuild')

esbuild
  .build({
    entryPoints: ['webview-ui/src/index.tsx'],
    bundle: true,
    outfile: 'out/webview/bundle.js',
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
      '.css': 'css',
      '.woff': 'file',
      '.woff2': 'file',
      '.ttf': 'file',
    },
    sourcemap: true,
    minify: false,
  })
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('Webview build complete: out/webview/bundle.js')
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Webview build failed:', err)
    process.exit(1)
  })
