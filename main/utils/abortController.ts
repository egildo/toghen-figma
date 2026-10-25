export interface SimpleAbortSignal {
  aborted: boolean;
}

export class SimpleAbortController {
  public signal: SimpleAbortSignal = { aborted: false };

  public abort(): void {
    this.signal.aborted = true;
  }
}
