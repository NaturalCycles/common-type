import {
  JsonSchema,
  JsonSchemaNumber,
  JsonSchemaString,
  StringMap,
  _assert,
  _stringMapEntries,
  _substringBefore,
} from '@naturalcycles/js-lib'
import { prettify } from './prettier.util'
import {
  isArraySchema,
  isBooleanSchema,
  isConstSchema,
  isEnumSchema,
  isIntersectionSchema,
  isNullSchema,
  isNumberSchema,
  isObjectSchema,
  isRefSchema,
  isStringSchema,
  isUnionSchema,
} from './util'

/* eslint-disable complexity */

const BANNER = [`//`, `// Auto-generated by common-type, do not edit manually`, `//`, ''].join('\n')

function indent(s: string, level: number): string {
  return '  '.repeat(level) + s
}

export type FileWithContent = [fileName: string, fileContent: string]

// shortcut
export function jsonSchemasToTS(schemas: JsonSchema[]): FileWithContent[] {
  return new JsonSchemaToTSGenerator().jsonSchemasToTS(schemas)
}

// For testing
export function rootJsonSchemaToTS(schema: JsonSchema): FileWithContent {
  return new JsonSchemaToTSGenerator().rootJsonSchemaToTS(schema)
}

class JsonSchemaToTSGenerator {
  private exports = new Set<string>()

  /**
   * Returns a StringMap, which is a map from `fileName` to string content of that file.
   */
  jsonSchemasToTS(schemas: JsonSchema[]): FileWithContent[] {
    const files = schemas.map(schema => this.rootJsonSchemaToTS(schema))

    files.push(this.getIndexFile())

    return files
  }

  private getIndexFile(): FileWithContent {
    const lines: string[] = [
      BANNER,
      ...[...this.exports].map(name => `export * from './${name}.type'`),
    ]

    return ['index.ts', prettify(lines.join('\n'))]
  }

  rootJsonSchemaToTS(schema: JsonSchema): FileWithContent {
    _assert(schema.$id, `$id should exist for JsonSchema to produce a TypeScript file`)

    const name = _substringBefore(schema.$id, '.schema.json')
    const fileName = `${name}.type.ts`
    this.exports.add(name)

    const lines: string[] = [BANNER]

    const { text, imports } = this.jsonSchemaToTSString(name, schema, 0)

    if (imports.size) {
      lines.push(`import { ${[...imports].join(', ')} } from '.'`, '')
    }

    lines.push(text)

    const fileContent = prettify(lines.join('\n'))

    return [fileName, fileContent]
  }

  private jsonSchemaToTSString(
    name: string,
    schema: JsonSchema,
    level: number,
  ): { text: string; imports: Set<string> } {
    const { imports, tags, text } = this.jsonSchemaToTS(name, schema, level)
    return { imports, text: [generateJSDoc(tags), text].filter(Boolean).join('\n') }
  }

  private jsonSchemaToTS(
    name: string,
    schema: JsonSchema,
    level: number,
  ): {
    tags: StringMap<string | number>
    text: string
    imports: Set<string>
  } {
    const tags = getSchemaTags(schema)
    const imports = new Set<string>()

    if (isUnionSchema(schema)) {
      const text = schema.oneOf
        .map(itemSchema => {
          const { imports: newImports, text } = this.jsonSchemaToTSString(
            'anonymous',
            itemSchema,
            level + 1,
          )
          newImports.forEach(s => imports.add(s))
          return text
        })
        .join(' | ')

      if (level === 0) {
        return { imports, tags, text: `export type ${name} = ${text}` }
      }

      return { imports, tags, text }
    }

    if (isIntersectionSchema(schema)) {
      const text = schema.allOf
        .map(itemSchema => {
          const { imports: newImports, text } = this.jsonSchemaToTSString(
            'anonymous',
            itemSchema,
            level + 1,
          )
          newImports.forEach(s => imports.add(s))
          return text
        })
        .join(' & ')

      if (level === 0) {
        return { imports, tags, text: `export type ${name} = ${text}` }
      }

      return { imports, tags, text }
    }

    if (isRefSchema(schema)) {
      const text = _substringBefore(schema.$ref, '.schema.json')
      imports.add(text)

      if (level === 0) {
        return { imports, tags, text: `export type ${name} = ${text}` }
      }

      return { imports, tags, text }
    }

    if (isEnumSchema(schema)) {
      if (schema.enum.some(v => typeof v === 'number')) {
        // JsonSchema doesn't preserve KEYS of enum, only values
        // In TypeScript you cannot have KEY of enum as number
        // So, the only choice we have here is to use union type (aka `oneOf`)
        const text = schema.enum.map(v => (typeof v === 'string' ? `'${v}'` : v)).join(' | ')

        if (level === 0) {
          return { imports, tags, text: `export type ${name} = ${text}` }
        }

        return { imports, tags, text }
      }

      const lines: string[] = [`{`]
      // lines.push(`export enum ${name} {`)

      schema.enum.forEach(enumValue => {
        if (typeof enumValue === 'string') {
          lines.push(indent(`${enumValue} = '${enumValue}',`, level + 1))
        } else {
          // Can be boolean?
          lines.push(indent(`'${enumValue}' = ${enumValue},`, level + 1))
        }
      })

      lines.push('}')

      if (level === 0) {
        return { imports, tags, text: `export enum ${name} ${lines.join('\n')}` }
      }

      return { imports, tags, text: lines.join('\n') }
    }

    if (isObjectSchema(schema)) {
      const lines: string[] = [`{`]

      Object.entries(schema.properties || {}).forEach(([propName, propSchema]) => {
        const opt = schema.required?.includes(propName) ? '' : '?'
        const {
          imports: newImports,
          tags: propTags,
          text,
        } = this.jsonSchemaToTS(propName, propSchema, level + 1)
        newImports.forEach(s => imports.add(s))
        if (Object.keys(propTags).length) {
          lines.push(
            ...generateJSDoc(propTags)
              .split('\n')
              .map(s => indent(s, level + 1)),
          )
        }
        lines.push(indent(`${propName}${opt}: ${text}`, level + 1))
      })

      const indexedSchema = Object.values(schema.patternProperties || {})[0]
      if (indexedSchema) {
        const { text, imports: newImports } = this.jsonSchemaToTSString(
          'anonymous',
          indexedSchema,
          level + 1,
        )
        newImports.forEach(s => imports.add(s))
        lines.push(indent(`[k: string]: ${text}`, level + 1))
      }

      lines.push(indent(`}`, level))

      if (level === 0) {
        return { imports, tags, text: `export interface ${name} ${lines.join('\n')}` }
      }

      return { imports, tags, text: `${lines.join('\n')}` }
    }

    if (isArraySchema(schema)) {
      if (Array.isArray(schema.items)) {
        // Tuple!
        const tokens = schema.items.map(itemSchema => {
          const { imports: newImports, text } = this.jsonSchemaToTSString(
            'anonymous',
            itemSchema,
            level + 1,
          )
          newImports.forEach(s => imports.add(s))
          return text
        })
        const text = `[${tokens.join(', ')}]`

        if (level === 0) {
          return { imports, tags, text: `export type ${name} = ${text}` }
        }

        return { imports, tags, text }
      }

      if (schema.minItems) {
        tags['minItems'] = schema.minItems
      }

      if (schema.maxItems) {
        tags['maxItems'] = schema.maxItems
      }

      if (schema.uniqueItems) {
        tags['uniqueItems'] = ''
      }

      const { text, imports: newImports } = this.jsonSchemaToTSString(
        'anonymous',
        schema.items,
        level + 1,
      )
      newImports.forEach(s => imports.add(s))

      if (level === 0) {
        return { imports, tags, text: `export type ${name} = (${text})[]` }
      }

      return { imports, tags, text: `(${text})[]` }
    }

    if (isStringSchema(schema)) {
      const tagKeys: (keyof JsonSchemaString)[] = ['pattern', 'format', 'minLength', 'maxLength']

      tagKeys.forEach(key => {
        if (schema[key]) {
          tags[key] = String(schema[key])
        }
      })

      if (schema.transform?.length) {
        if (schema.transform.includes('trim')) {
          tags['trim'] = ''
        }
        if (schema.transform.includes('toLowerCase')) {
          tags['toLowerCase'] = ''
        }
        if (schema.transform.includes('toUpperCase')) {
          tags['toUpperCase'] = ''
        }
      }

      if (level === 0) {
        return { imports, tags, text: `export type ${name} = string;` }
      }
      return { imports, tags, text: `string` }
    }

    if (isNumberSchema(schema)) {
      const tagKeys: (keyof JsonSchemaNumber)[] = [
        'minimum',
        'maximum',
        'exclusiveMinimum',
        'exclusiveMaximum',
        'multipleOf',
        'format',
      ]

      tagKeys.forEach(key => {
        if (schema[key]) {
          tags[key] = String(schema[key])
        }
      })

      if (schema.type === 'integer') {
        tags['validationType'] = 'integer'
      }

      if (level === 0) {
        return { imports, tags, text: `export type ${name} = number;` }
      }

      return { imports, tags, text: `number` }
    }

    if (isBooleanSchema(schema)) {
      if (level === 0) {
        return { imports, tags, text: `export type ${name} = boolean;` }
      }
      return { imports, tags, text: `boolean` }
    }

    if (isNullSchema(schema)) {
      if (level === 0) {
        return { imports, tags, text: `export type ${name} = null;` }
      }
      return { imports, tags, text: `null` }
    }

    if (isConstSchema(schema)) {
      const text = typeof schema.const === 'string' ? `'${schema.const}'` : schema.const

      if (level === 0) {
        return { imports, tags, text: `export type ${name} = ${text}` }
      }

      return { imports, tags, text }
    }

    // if (level === 0) {
    //   return `export type ${name} = any;`
    // }
    // return `any`

    console.log(name, schema)
    throw new Error(`unknown schema ${name}`)
  }
}

// todo: run over Prettier in the end? why not? Same for json-schema json files (more compact and readable!)

function generateJSDoc(tags: StringMap<string | number>): string {
  if (!Object.keys(tags).length) return ''

  const lines: string[] = ['/**']

  _stringMapEntries(tags).forEach(([tagName, tagValue]) => {
    if (tagName === 'description') {
      lines.push(
        ...String(tagValue)
          .split('\n')
          .map(s => ` * ${s}`),
      )
    } else {
      lines.push(` * @${tagName} ${tagValue}`)
    }
  })

  lines.push(' */')

  return lines.join('\n')
}

function getSchemaTags(s: JsonSchema): StringMap<string | number> {
  const tags: StringMap = {}

  if (s.description) {
    tags['description'] = s.description
  }

  if (s.default) {
    tags['default'] = s.default
  }

  if (s.deprecated) {
    tags['deprecated'] = ''
  }

  if (s.readOnly) {
    tags['readOnly'] = ''
  }

  if (s.writeOnly) {
    tags['writeOnly'] = ''
  }

  return tags
}
