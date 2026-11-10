import { currentStorage } from "../context";
import { runExecute, runSelect } from "../sql";

export interface QueryResult {
  rowsAffected: number;
  lastInsertId?: number;
}

/** Reemplazo de @tauri-apps/plugin-sql: consulta la base del comercio de este pedido. */
export default class Database {
  static async load(_path: string): Promise<Database> {
    return new Database();
  }

  static get(_path: string): Database {
    return new Database();
  }

  async select<T>(query: string, bindValues?: unknown[]): Promise<T> {
    return runSelect(currentStorage(), query, bindValues) as T;
  }

  async execute(query: string, bindValues?: unknown[]): Promise<QueryResult> {
    return runExecute(currentStorage(), query, bindValues);
  }

  async close(_db?: string): Promise<boolean> {
    return true;
  }
}
