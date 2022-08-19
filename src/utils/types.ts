import { IndexingPolicy } from "@azure/cosmos"

export interface CompositeIndexingPolicy extends IndexingPolicy {
  compositeIndexes: ReadonlyArray<ReadonlyArray<IndexPath>>
}

export enum IndexOrder {
  ASC = "ascending",
  DESC = "descending"
}

export interface IndexPath {
  order: IndexOrder,
  path: string
}
