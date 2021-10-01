import { _range } from '@naturalcycles/js-lib'
import { AjvSchema } from '@naturalcycles/nodejs-lib'
import { generateJsonSchemaFromData } from './generateJsonSchemaFromData'

test('generateJsonSchemaFromData1', () => {
  const data1 = _range(5).map(i => {
    return { a: 'a', n: i, b: i % 2 === 0, c: null, u: undefined }
  })

  const s = generateJsonSchemaFromData(data1)
  // console.log(s)
  expect(s).toMatchInlineSnapshot(`
    Object {
      "additionalProperties": true,
      "properties": Object {
        "a": Object {
          "type": "string",
        },
        "b": Object {
          "type": "boolean",
        },
        "c": Object {
          "type": "null",
        },
        "n": Object {
          "type": "number",
        },
      },
      "required": Array [],
      "type": "object",
    }
  `)

  const schema = AjvSchema.create(s)
  data1.forEach(r => schema.validate(r))
})

test('generateJsonSchemaFromData2', () => {
  const data2 = _range(20).map(i => {
    const r: any = { a: 'a', n: i, b: i % 2 === 0, u: undefined }

    if (i % 3 === 0) {
      r.c = null

      r.sub = {
        aa: 'aa',
        sub2: {
          n: null,
          b: false,
        },
      }
    }

    if (i % 4 === 0) {
      r.sub = false
    }

    if (i % 5 === 0) {
      r.arr = [1, 2, 3]
      r.arr2 = [1, 2, 3, 'str', true, { a: 's' }]
    }

    return r
  })

  const s = generateJsonSchemaFromData(data2)

  // console.log(JSON.stringify(s, null, 2))
  // console.log(inspectAny(s, {
  //   depth: 100,
  //   maxLen: 1000000,
  // }))
  expect(s).toMatchSnapshot()

  const schema = AjvSchema.create(s)
  data2.forEach(r => schema.validate(r))
})
