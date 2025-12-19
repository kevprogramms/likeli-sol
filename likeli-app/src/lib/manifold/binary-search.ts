export function binarySearch(
    min: number,
    max: number,
    comparator: (value: number) => number,
    epsilon = 0.0001
): number {
    let currMin = min
    let currMax = max
    let iterations = 0

    while (iterations < 100) {
        const mid = (currMin + currMax) / 2
        const result = comparator(mid)

        if (Math.abs(result) < epsilon || Math.abs(currMax - currMin) < epsilon) {
            return mid
        }

        if (result > 0) {
            currMin = mid
        } else {
            currMax = mid
        }
        iterations++
    }
    return (currMin + currMax) / 2
}
