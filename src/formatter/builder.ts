import getColorFns from './get_color_fns'
import JavascriptSnippetSyntax from './step_definition_snippet_builder/javascript_snippet_syntax'
import JsonFormatter from './json_formatter'
import MessageFormatter from './message_formatter'
import path from 'path'
import ProgressBarFormatter from './progress_bar_formatter'
import ProgressFormatter from './progress_formatter'
import RerunFormatter from './rerun_formatter'
import SnippetsFormatter from './snippets_formatter'
import StepDefinitionSnippetBuilder from './step_definition_snippet_builder'
import SummaryFormatter from './summary_formatter'
import UsageFormatter from './usage_formatter'
import UsageJsonFormatter from './usage_json_formatter'
import { ISupportCodeLibrary } from '../support_code_library_builder/types'
import Formatter, { IFormatterCleanupFn, IFormatterLogFn } from '.'
import { doesHaveValue, doesNotHaveValue } from '../value_checker'
import { EventEmitter } from 'events'
import EventDataCollector from './helpers/event_data_collector'
import { Writable as WritableStream } from 'stream'
import { IParsedArgvFormatOptions } from '../cli/argv_parser'
import { SnippetInterface } from './step_definition_snippet_builder/snippet_syntax'
import HtmlFormatter from './html_formatter'
import { pathToFileURL } from 'url'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { importer } = require('../importer')

interface IGetStepDefinitionSnippetBuilderOptions {
  cwd: string
  snippetInterface?: SnippetInterface
  snippetSyntax?: string
  supportCodeLibrary: ISupportCodeLibrary
}

export interface IBuildOptions {
  cwd: string
  eventBroadcaster: EventEmitter
  eventDataCollector: EventDataCollector
  log: IFormatterLogFn
  parsedArgvOptions: IParsedArgvFormatOptions
  stream: WritableStream
  cleanup: IFormatterCleanupFn
  supportCodeLibrary: ISupportCodeLibrary
}

const FormatterBuilder = {
  async build(type: string, options: IBuildOptions): Promise<Formatter> {
    const FormatterConstructor = await FormatterBuilder.getConstructorByType(
      type,
      options.cwd
    )
    const colorFns = getColorFns(options.parsedArgvOptions.colorsEnabled)
    const snippetBuilder =
      await FormatterBuilder.getStepDefinitionSnippetBuilder({
        cwd: options.cwd,
        snippetInterface: options.parsedArgvOptions.snippetInterface,
        snippetSyntax: options.parsedArgvOptions.snippetSyntax,
        supportCodeLibrary: options.supportCodeLibrary,
      })
    return new FormatterConstructor({
      colorFns,
      snippetBuilder,
      ...options,
    })
  },

  async getConstructorByType(
    type: string,
    cwd: string
  ): Promise<typeof Formatter> {
    switch (type) {
      case 'json':
        return JsonFormatter
      case 'message':
        return MessageFormatter
      case 'html':
        return HtmlFormatter
      case 'progress':
        return ProgressFormatter
      case 'progress-bar':
        return ProgressBarFormatter
      case 'rerun':
        return RerunFormatter
      case 'snippets':
        return SnippetsFormatter
      case 'summary':
        return SummaryFormatter
      case 'usage':
        return UsageFormatter
      case 'usage-json':
        return UsageJsonFormatter
      default:
        return await FormatterBuilder.loadCustomFormatter(type, cwd)
    }
  },

  async getStepDefinitionSnippetBuilder({
    cwd,
    snippetInterface,
    snippetSyntax,
    supportCodeLibrary,
  }: IGetStepDefinitionSnippetBuilderOptions) {
    if (doesNotHaveValue(snippetInterface)) {
      snippetInterface = SnippetInterface.Synchronous
    }
    let Syntax = JavascriptSnippetSyntax
    if (doesHaveValue(snippetSyntax)) {
      const fullSyntaxPath = path.resolve(cwd, snippetSyntax)
      Syntax = FormatterBuilder.resolveConstructor(
        await importer(pathToFileURL(fullSyntaxPath))
      )
    }
    return new StepDefinitionSnippetBuilder({
      snippetSyntax: new Syntax(snippetInterface),
      parameterTypeRegistry: supportCodeLibrary.parameterTypeRegistry,
    })
  },

  async loadCustomFormatter(customFormatterPath: string, cwd: string) {
    let CustomFormatter = customFormatterPath.startsWith(`.`)
      ? await importer(pathToFileURL(path.resolve(cwd, customFormatterPath)))
      : await importer(customFormatterPath)
    CustomFormatter = FormatterBuilder.resolveConstructor(CustomFormatter)
    if (doesHaveValue(CustomFormatter)) {
      return CustomFormatter
    } else {
      throw new Error(
        `Custom formatter (${customFormatterPath}) does not export a function`
      )
    }
  },

  resolveConstructor(ImportedCode: any) {
    if (typeof ImportedCode === 'function') {
      return ImportedCode
    } else if (
      doesHaveValue(ImportedCode) &&
      typeof ImportedCode.default === 'function'
    ) {
      return ImportedCode.default
    }
    return null
  },
}

export default FormatterBuilder
