import type { Attempt } from '../shared/types'

export interface AttemptRepo {
  add: (attempt: Attempt) => Promise<void>
  list: () => Promise<Attempt[]>
}

