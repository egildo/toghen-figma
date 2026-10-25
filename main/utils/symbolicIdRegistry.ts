export class SymbolicIdRegistry {
  private readonly map = new Map<string, string>();

  register(symbolicId: string, realId: string): void {
    if (!symbolicId.startsWith('$')) {
      throw new Error(`Invalid symbolic ID (must start with $): ${symbolicId}`);
    }
    if (!realId) {
      throw new Error(`Invalid real ID for symbolic ID ${symbolicId}`);
    }

    this.map.set(symbolicId, realId);
  }

  resolve(id: string): string {
    if (!id.startsWith('$')) return id;

    const real = this.map.get(id);
    if (!real) throw new Error(`Unresolved symbolic ID: ${id}`);
    return real;
  }

  has(symbolicId: string): boolean {
    return this.map.has(symbolicId);
  }
}
