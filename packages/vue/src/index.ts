// This entry is the "full-build" that includes both the runtime
// and the compiler, and supports on-the-fly compilation of the template option.
import { initDev } from './dev'
import { compile, CompilerOptions, CompilerError } from '@vue/compiler-dom'
import { registerRuntimeCompiler, RenderFunction, warn } from '@vue/runtime-dom'
import * as runtimeDom from '@vue/runtime-dom'
import { isString, NOOP, generateCodeFrame, extend } from '@vue/shared'
import { InternalRenderFunction } from 'packages/runtime-core/src/component'

if (__DEV__) {
  initDev()
}

const compileCache: Record<string, RenderFunction> = Object.create(null)

// 这个函数目的是为了将模板字符串，如<div>3</div>+编译选项转换成标准的render函数
function compileToFunction(
  template: string | HTMLElement,
  options?: CompilerOptions
): RenderFunction {
  // 1.处理元素node对象，将其转为字符串，也就是获取他的innerHtml字符串
  if (!isString(template)) {
    if (template.nodeType) {
      template = template.innerHTML
    } else {
      __DEV__ && warn(`invalid template option: `, template)
      return NOOP
    }
  }

  // 缓存
  const key = template
  const cached = compileCache[key]
  if (cached) {
    return cached
  }

  // 2.处理字符串是选择器字符串时，如#app，获取真正的innnerHtml字符串
  if (template[0] === '#') {
    const el = document.querySelector(template)
    if (__DEV__ && !el) {
      warn(`Template element not found or is empty: ${template}`)
    }
    // __UNSAFE__
    // Reason: potential execution of JS expressions in in-DOM template.
    // The user must make sure the in-DOM template is trusted. If it's rendered
    // by the server, the template should not contain any user data.
    template = el ? el.innerHTML : ``
  }

  // 3.合并编译选项
  const opts = extend(
    {
      hoistStatic: true, // 注明他是静态提升，也就是只会被创建一次，在渲染时重新复用
      onError: __DEV__ ? onError : undefined,
      onWarn: __DEV__ ? e => onError(e, true) : NOOP
    } as CompilerOptions,
    options
  )

  // 增加自定义元素函数的默认值
  if (!opts.isCustomElement && typeof customElements !== 'undefined') {
    opts.isCustomElement = tag => !!customElements.get(tag)
  }

  // 4.核心编译函数
  const { code } = compile(template, opts)

  // 错误函数，主要是标准化了错误格式
  function onError(err: CompilerError, asWarning = false) {
    const message = asWarning
      ? err.message
      : `Template compilation error: ${err.message}`
    const codeFrame =
      err.loc &&
      generateCodeFrame(
        template as string,
        err.loc.start.offset,
        err.loc.end.offset
      )
    warn(codeFrame ? `${message}\n${codeFrame}` : message)
  }

  // 通配符导入会生成一个包含所有导出的键的巨大对象，这些键无法进行压缩(如树摇)，并且可能非常占用空间。在全局构建中，我们知道 Vue 可以在全局范围内访问，因此我们可以避免使用通配符对象。
  // 通配符导入：import * as runtimeDom from '@vue/runtime-dom'; new Function('Vue', code)(runtimeDom) 这个是十分消耗性能的
  // The wildcard import results in a huge object with every export
  // with keys that cannot be mangled, and can be quite heavy size-wise.
  // In the global build we know `Vue` is available globally so we can avoid
  // the wildcard object.
  const render = (
    __GLOBAL__ ? new Function(code)() : new Function('Vue', code)(runtimeDom)
  ) as RenderFunction

  // mark the function as runtime compiled
  ;(render as InternalRenderFunction)._rc = true // 标记为运行时编译，表明他和普通的vue模板、jsx里的生成的render函数是不一样的，指明他是通过complier函数生成的render函数，会在一些优化上用到

  return (compileCache[key] = render)
}

registerRuntimeCompiler(compileToFunction)

export { compileToFunction as compile }
export * from '@vue/runtime-dom'
