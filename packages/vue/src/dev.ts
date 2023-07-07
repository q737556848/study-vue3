import { initCustomFormatter } from '@vue/runtime-dom'

export function initDev() {
  if (__BROWSER__) {
    /* istanbul ignore if */
    if (!__ESM_BUNDLER__) {
      // 这个只是个提示而已，提醒你注意要在生产环境使用prod文件，没啥作用
      console.info(
        `You are running a development build of Vue.\n` +
          `Make sure to use the production build (*.prod.js) when deploying for production.`
      )
    }

    // 这个主要是为了初始化chrome的devtool的格式
    initCustomFormatter()
  }
}
