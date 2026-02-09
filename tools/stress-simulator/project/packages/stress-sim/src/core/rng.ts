export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 1;
  }

  private next(): number {
    this.state ^= this.state << 13;
    this.state ^= this.state >> 17;
    this.state ^= this.state << 5;
    this.state = this.state >>> 0;
    return this.state;
  }

  float(): number {
    return this.next() / 0xffffffff;
  }

  int(min: number, max: number): number {
    return min + (this.next() % (max - min + 1));
  }

  bool(probability = 0.5): boolean {
    return this.float() < probability;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.next() % arr.length];
  }

  string(length: number): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars[this.next() % chars.length];
    }
    return result;
  }

  fork(): SeededRng {
    return new SeededRng(this.next());
  }
}
