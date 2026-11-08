declare module "cloudflare:workers" {
  interface Result<T = unknown> { results: T[]; meta: { changes: number } }
  interface Statement {
    bind(...values: unknown[]): Statement;
    first<T = unknown>(): Promise<T | null>;
    all<T = unknown>(): Promise<Result<T>>;
    run<T = unknown>(): Promise<Result<T>>;
  }
  interface Database {
    prepare(sql: string): Statement;
    batch(statements: Statement[]): Promise<Result[]>;
  }
  export const env: {
    DB: Database;
    PROVIDER_ENCRYPTION_KEY: string;
    ACCESS_AUDIENCE: string;
    ACCESS_TEAM_DOMAIN: string;
    ACCESS_OWNER_EMAIL: string;
  };
}
