/**
 * `node:test` ve `node:assert/strict` için asgari tipler.
 *
 * Proje bilinçli olarak `@types/node` taşımıyor (çekirdek tarayıcıda
 * koşuyor, Node API'sine dokunmamalı). Testlerin kullandığı yüzey küçük;
 * onu burada tarif etmek, bütün Node tiplerini çekirdeğin tip alanına
 * sokmaktan daha dürüst.
 */
declare module 'node:test' {
  type TestFn = () => void | Promise<void>;
  export function test(name: string, fn: TestFn): void;
  export function describe(name: string, fn: () => void): void;
  export default test;
}

declare module 'node:assert/strict' {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notDeepEqual(actual: unknown, expected: unknown, message?: string): void;
    match(value: string, pattern: RegExp, message?: string): void;
    fail(message?: string): never;
  }
  const assert: Assert;
  export default assert;
}
