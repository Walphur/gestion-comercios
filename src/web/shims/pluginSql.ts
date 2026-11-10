import { webCall } from "../api";

export interface QueryResult {
  rowsAffected: number;
  lastInsertId?: number;
}

/**
 * Reemplazo de @tauri-apps/plugin-sql en el navegador. Lo usan solo las funciones que
 * no pasan por el servidor (sin transacción: cada consulta va sola por internet).
 */
export default class Database {
  static async load(_path: string): Promise<Database> {
    return new Database();
  }

  static get(_path: string): Database {
    return new Database();
  }

  select<T>(query: string, bindValues?: unknown[]): Promise<T> {
    return webCall<T>("/v1/sql", { kind: "select", sql: query, params: bindValues ?? [] });
  }

  execute(query: string, bindValues?: unknown[]): Promise<QueryResult> {
    return webCall<QueryResult>("/v1/sql", { kind: "execute", sql: query, params: bindValues ?? [] });
  }

  async close(_db?: string): Promise<boolean> {
    return true;
  }
}
