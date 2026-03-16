/**
 * Minimal global type declarations for APIs that exist in all target
 * runtimes (browsers, Workers, Node 18+) but are not included in the
 * default TypeScript lib for ES2022.
 */

declare class URL {
  constructor(url: string | URL, base?: string | URL);
  readonly href: string;
  readonly origin: string;
  readonly protocol: string;
  readonly host: string;
  readonly hostname: string;
  readonly port: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  toString(): string;
  toJSON(): string;
}
