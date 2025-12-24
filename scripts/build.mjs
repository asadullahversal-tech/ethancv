import * as esbuild from 'esbuild'
import { rimraf } from 'rimraf'
import stylePlugin from 'esbuild-style-plugin'
import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

dotenv.config()

const args = process.argv.slice(2)
const isProd = args[0] === '--production'

await rimraf('dist')

/**
 * @type {esbuild.BuildOptions}
 */
const esbuildOpts = {
  color: true,
  entryPoints: ['src/main.tsx', 'index.html'],
  outdir: 'dist',
  entryNames: '[name]',
  write: true,
  bundle: true,
  format: 'iife',
  sourcemap: isProd ? false : 'linked',
  minify: isProd,
  treeShaking: true,
  jsx: 'automatic',
  loader: {
    '.html': 'copy',
    '.png': 'file',
  },
  define: {
    'process.env.STRIPE_PUBLISHABLE_KEY': JSON.stringify(process.env.STRIPE_PUBLISHABLE_KEY || ''),
    'process.env.STRIPE_API_BASE_URL': JSON.stringify(process.env.STRIPE_API_BASE_URL || ''),
  },
  plugins: [
    stylePlugin({
      postcss: {
        plugins: [tailwindcss, autoprefixer],
      },
    }),
  ],
}

if (isProd) {
  await esbuild.build(esbuildOpts)
  // Copy _redirects file for Netlify
  const redirectsPath = path.join(process.cwd(), 'public', '_redirects')
  const distRedirectsPath = path.join(process.cwd(), 'dist', '_redirects')
  if (fs.existsSync(redirectsPath)) {
    fs.copyFileSync(redirectsPath, distRedirectsPath)
    console.log('Copied _redirects file to dist')
  }
} else {
  const ctx = await esbuild.context(esbuildOpts)
  await ctx.watch()
  const { hosts, port } = await ctx.serve()
  console.log(`Running on:`)
  hosts.forEach((host) => {
    console.log(`http://${host}:${port}`)
  })
}
