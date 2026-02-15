declare module "bun:test" {
  export type TestFunction = (name: string, fn: () => void | Promise<void>) => void;
  export const test: TestFunction;
  export const it: TestFunction;
  export const describe: (name: string, fn: () => void | Promise<void>) => void;
  export const beforeAll: (fn: () => void | Promise<void>) => void;
  export const beforeEach: (fn: () => void | Promise<void>) => void;

  export interface Expectation {
    toBe(value: unknown): void;
    toEqual(value: unknown): void;
    toContain(value: unknown): void;
    toBeNull(): void;
    toBeDefined(): void;
    not: Expectation;
  }

  export function expect(value: unknown): Expectation;

  export function spyOn<T extends object, K extends keyof T>(
    target: T,
    method: K,
  ): {
    mockImplementation(fn: (...args: unknown[]) => unknown): void;
  };
}
