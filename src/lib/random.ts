export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

export function takeRandom<T>(items: readonly T[], count: number): T[] {
  if (count <= 0 || items.length === 0) {
    return [];
  }

  if (count <= items.length) {
    return shuffle(items).slice(0, count);
  }

  const result: T[] = [];
  while (result.length < count) {
    const remaining = count - result.length;
    result.push(...shuffle(items).slice(0, Math.min(items.length, remaining)));
  }

  return result;
}
