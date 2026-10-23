/** Remove apenas branco quase puro conectado às bordas; cores e ilhas brancas internas ficam intactas. */
export function removeOuterWhite(data: Uint8ClampedArray, width: number, height: number): number {
  const white = (i: number) => data[i * 4 + 3] > 0 && data[i * 4] >= 250 && data[i * 4 + 1] >= 250 && data[i * 4 + 2] >= 250
  const stack: number[] = []
  for (let x = 0; x < width; x++) { stack.push(x, (height - 1) * width + x) }
  for (let y = 1; y < height - 1; y++) { stack.push(y * width, y * width + width - 1) }
  let removed = 0
  while (stack.length) {
    const seed = stack.pop()!
    if (!white(seed)) continue
    const y = Math.floor(seed / width)
    let left = seed % width
    while (left > 0 && white(y * width + left - 1)) left--
    let above = false, below = false
    for (let x = left; x < width && white(y * width + x); x++) {
      data[(y * width + x) * 4 + 3] = 0
      removed++
      const a = y > 0 && white((y - 1) * width + x)
      const b = y < height - 1 && white((y + 1) * width + x)
      if (a && !above) stack.push((y - 1) * width + x)
      if (b && !below) stack.push((y + 1) * width + x)
      above = a; below = b
    }
  }
  return removed
}
