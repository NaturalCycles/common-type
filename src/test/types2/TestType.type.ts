//
// Auto-generated by @naturalcycles/json-schema-lib, do not edit manually
//

import { Person } from '.'

export interface TestType {
  s: string
  n: null
  s2: string | null
  p: (Person | null)[]
  lhdays: [number, number][]
  lit?: 'some string'
  nlit?: 26
  litb?: true
  intersect?: Person & {
    id: string
  }
}
