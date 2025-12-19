// lib/manifold/util/object.ts
// Object utilities from Manifold

export const addObjects = <T extends { [key: string]: number }>(
    obj1: T,
    obj2: T
): T => {
    const result = { ...obj1 }
    for (const key of Object.keys(obj2) as (keyof T)[]) {
        result[key] = ((result[key] ?? 0) + obj2[key]) as T[keyof T]
    }
    return result
}
