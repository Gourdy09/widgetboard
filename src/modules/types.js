// Types of the widget contract, for editors and the runtime. Nothing here runs.
// The specification is docs/WIDGET_SPEC.md in https://github.com/Gourdy09/widgetboard-widgets
// (Widget API 1). Keep this file in step with it.

/**
 * @typedef {"string"|"text"|"number"|"boolean"|"select"|"combobox"|"secret"} SettingType
 *
 * @typedef {Object} WidgetSetting
 * @property {SettingType} type
 * @property {string} label
 * @property {string} [help]
 * @property {boolean} [required]
 * @property {string} [placeholder]          string, text
 * @property {number} [maxLength]            string (<= 200), text (<= 2000)
 * @property {number} [min]                  number
 * @property {number} [max]                  number
 * @property {number} [step]                 number
 * @property {Array<string|{value: string, label: string}>} [options]   select, combobox
 * @property {boolean} [allowCustom]         combobox, default true
 * @property {string|number|boolean} [default]   never present on a secret
 *
 * @typedef {Object} WidgetManifest
 * @property {1} schema_version
 * @property {string} id                     "<namespace>.<name>"
 * @property {string[]} [aliases]            legacy card types this widget answers to
 * @property {string} name
 * @property {string} version                MAJOR.MINOR.PATCH
 * @property {string} description
 * @property {string} author
 * @property {string} [homepage]
 * @property {string} license
 * @property {string} category
 * @property {string[]} [tags]
 * @property {{api: number, min_widgetboard?: string}} requires
 * @property {string} entry                  .js, relative to the package
 * @property {string} [styles]               .css, relative to the package
 * @property {{default: [number, number], min?: [number, number], max?: [number, number]}} size   [columns, rows]
 * @property {{default: number, min?: number}} [refresh]    milliseconds
 * @property {Record<string, WidgetSetting>} [settings]
 * @property {Array<{key: string, label: string}>} [elements]
 * @property {{network?: string[]}} [permissions]
 */

/**
 * @typedef {"visible"|"hidden"|"collapsed"} Visibility
 *
 * @typedef {Object} WidgetSize
 * @property {number} width    pixels
 * @property {number} height   pixels
 * @property {number} cols     grid cells
 * @property {number} rows     grid cells
 *
 * @typedef {Object} WidgetHttpResponse
 * @property {boolean} ok
 * @property {number} status
 * @property {Record<string, string>} headers
 * @property {() => Promise<string>} text
 * @property {() => Promise<any>} json
 *
 * What the host gives a widget. Built-in widgets receive it directly; installed widgets receive the same
 * surface through a message bridge into a sandboxed frame.
 *
 * @typedef {Object} WidgetContext
 * @property {string} id
 * @property {string} version
 * @property {number} instanceId                                  the card's id in the layout
 * @property {Readonly<Record<string, unknown>>} settings         non-secret, defaults filled
 * @property {{title?: HTMLElement, subtitle?: HTMLElement, main?: HTMLElement, footer?: HTMLElement}} slots
 * @property {(key: string, tag?: string, className?: string) => HTMLElement|null} part   widgets that declare `elements`
 * @property {WidgetSize} size
 * @property {(fn: (size: WidgetSize) => void) => () => void} onResize
 * @property {AbortSignal} signal                                 aborted at teardown
 * @property {(fn: () => void, ms: number) => number} setInterval   host-managed: cleared at teardown
 * @property {(id: number) => void} clearInterval
 * @property {(fn: () => void, ms: number) => number} setTimeout
 * @property {(id: number) => void} clearTimeout
 * @property {{fetch: (url: string, init?: {method?: "GET"|"POST", headers?: Record<string, string>, body?: string}) => Promise<WidgetHttpResponse>}} http
 * @property {(level: "debug"|"info"|"warn"|"error", message: string) => void} log
 *
 * What a widget's entry module exports as `default`.
 *
 * @typedef {Object} WidgetModule
 * @property {(ctx: WidgetContext) => void|Promise<void>} mount
 * @property {(ctx: WidgetContext) => void|Promise<void>} [refresh]
 * @property {(ctx: WidgetContext) => void|Promise<void>} [update]
 * @property {(ctx: WidgetContext) => void|Promise<void>} [unmount]
 */

export {};
