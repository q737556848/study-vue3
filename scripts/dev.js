// @ts-check

// Using esbuild for faster dev builds.
// We are still using Rollup for production builds because it generates
// smaller files w/ better tree-shaking.

import esbuild from 'esbuild'
import { resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import minimist from 'minimist'
import { polyfillNode } from 'esbuild-plugin-polyfill-node'

// import.meta.url                           file:///Users/laixiaotao/Desktop/my-projects/learning-projects/vue3/scripts/dev.js；
// fileURLToPath(import.meta.url)            /Users/laixiaotao/Desktop/my-projects/learning-projects/vue3/scripts/dev.js
// dirname(fileURLToPath(import.meta.url))   /Users/laixiaotao/Desktop/my-projects/learning-projects/vue3/scripts
const require = createRequire(import.meta.url) // 解决package.json type设为module时，无法使用commonjs的require导入方法，引用：https://www.jianshu.com/p/942b83c7a740
const __dirname = dirname(fileURLToPath(import.meta.url))
const args = minimist(process.argv.slice(2)) // 获取参数，第一个参数是路径，minimist是一个解析命令行参数的包
const target = args._[0] || 'vue' // 构建目标，对应packages下不同的包
const format = args.f || 'global' // 构建格式，1.针对不同模块管理，如commonjs，cmd；2.针对包的大小；3.针对有没有运行时
const inlineDeps = args.i || args.inline // 是否使用内置的依赖，如果不使用，则使用外来的依赖，external
const pkg = require(`../packages/${target}/package.json`) // 获取构建目标的package.json

// resolve output
// 获取最终构建格式，这里说明了global的包，其实就是iife
const outputFormat = format.startsWith('global')
  ? 'iife'
  : format === 'cjs'
  ? 'cjs'
  : 'esm'

// 构建的dist文件的包名后缀，这里主要是为了获取-runtime
const postfix = format.endsWith('-runtime')
  ? `runtime.${format.replace(/-runtime$/, '')}`
  : format

// 构建的dist文件的输出路径——绝对路径
const outfile = resolve(
  __dirname,
  `../packages/${target}/dist/${
    target === 'vue-compat' ? `vue` : target
  }.${postfix}.js`
)
// 构建的dist文件的输出路径——相对路径
const relativeOutfile = relative(process.cwd(), outfile)

// resolve externals
// TODO this logic is largely duplicated from rollup.config.js
// 不同打包格式下，允许使用外包依赖时，对应的external值
let external = []
if (!inlineDeps) {
  // cjs & esm-bundler: external all deps
  // cjs和esm-bundler因为是要给服务端使用，如node，因此要求全量的依赖，引用：https://blog.csdn.net/weixin_29621655/article/details/112705518
  if (format === 'cjs' || format.includes('esm-bundler')) {
    external = [
      ...external,
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
      // for @vue/compiler-sfc / server-renderer
      'path',
      'url',
      'stream'
    ]
  }

  if (target === 'compiler-sfc') {
    const consolidatePkgPath = require.resolve(
      '@vue/consolidate/package.json',
      {
        paths: [resolve(__dirname, `../packages/${target}/`)]
      }
    )
    const consolidateDeps = Object.keys(
      require(consolidatePkgPath).devDependencies
    )
    external = [
      ...external,
      ...consolidateDeps,
      'fs',
      'vm',
      'crypto',
      'react-dom/server',
      'teacup/lib/express',
      'arc-templates/dist/es5',
      'then-pug',
      'then-jade'
    ]
  }
}

const plugins = [
  {
    name: 'log-rebuild',
    setup(build) {
      build.onEnd(() => {
        console.log(`built: ${relativeOutfile}`) // 告诉你包的相对路径，built: packages/vue/dist/vue.global.js
      })
    }
  }
]

// 这个我猜测是为了修复内部用esm打包时，node的全局变量的缺失，如node.process
if (format === 'cjs' || pkg.buildOptions?.enableNonBrowserBranches) {
  plugins.push(polyfillNode())
}

esbuild
  .context({
    entryPoints: [resolve(__dirname, `../packages/${target}/src/index.ts`)],
    outfile,
    bundle: true, // 是否内联导入的依赖文件的代码
    external,
    sourcemap: true,
    format: outputFormat,
    globalName: pkg.buildOptions?.name, // 全局名称
    platform: format === 'cjs' ? 'node' : 'browser',
    plugins,
    define: {
      __COMMIT__: `"dev"`,
      __VERSION__: `"${pkg.version}"`,
      __DEV__: `true`,
      __TEST__: `false`,
      __BROWSER__: String(
        format !== 'cjs' && !pkg.buildOptions?.enableNonBrowserBranches
      ),
      __GLOBAL__: String(format === 'global'),
      __ESM_BUNDLER__: String(format.includes('esm-bundler')), // 这个是提供给rollup、webpack等打包器使用的
      __ESM_BROWSER__: String(format.includes('esm-browser')), // 这个是提供给游览器使用的
      __NODE_JS__: String(format === 'cjs'),
      __SSR__: String(format === 'cjs' || format.includes('esm-bundler')),
      __COMPAT__: String(target === 'vue-compat'),
      __FEATURE_SUSPENSE__: `true`,
      __FEATURE_OPTIONS_API__: `true`,
      __FEATURE_PROD_DEVTOOLS__: `false`
    }
  })
  .then(ctx => ctx.watch())
