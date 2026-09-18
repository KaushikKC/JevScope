/**
 * Stub for the `server-only` guard in tests.
 *
 * In the app that import is what makes a client-side import of the Jev client a
 * build error. Under Vitest we are already in Node, so it is aliased to this
 * empty module rather than weakened in the source.
 */
export {};
