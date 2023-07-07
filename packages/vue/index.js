'use strict'

// 这里只给包调用者入口而已，真正打包是借用外面rollup和esbuild
if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/vue.cjs.prod.js')
} else {
  module.exports = require('./dist/vue.cjs.js')
}
