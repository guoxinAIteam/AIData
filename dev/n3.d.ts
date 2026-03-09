declare module "n3" {
  export interface Quad {
    subject: { value: string; termType?: string };
    predicate: { value: string };
    object: { value: string; termType?: string };
    graph?: { value: string };
  }
  export class Store {
    addQuad(subject: unknown, predicate?: unknown, object?: unknown, graph?: unknown): void;
    addQuads(quads: Quad[]): void;
    getQuads(subject: unknown, predicate: unknown, object: unknown, graph: unknown): Quad[];
  }
  export class Parser {
    parse(input: string): Quad[];
  }
  export class Writer {
    constructor(opts?: { format?: string });
    addQuads(quads: Quad[]): void;
    end(callback: (err: Error | null, result: string) => void): void;
  }
  export const DataFactory: {
    namedNode(iri: string): unknown;
    literal(value: string): unknown;
    defaultGraph(): unknown;
    quad(subject: unknown, predicate: unknown, object: unknown, graph?: unknown): Quad;
  };
}
