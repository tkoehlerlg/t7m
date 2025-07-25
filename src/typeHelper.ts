/**
 * Type that only includes properties that are possibly undefined.
 * @template T The type to process.
 */
export type OnlyPossiblyUndefined<T> = {
    [P in keyof T as undefined extends T[P] ? P : never]: T[P]
}
