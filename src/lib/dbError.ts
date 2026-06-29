import { MSG_DELETE_FAILED, PRODUCT_DELETE_ERROR } from "./userError";

export { PRODUCT_DELETE_ERROR, MSG_DELETE_FAILED };

export function formatProductDeleteError(_e: unknown): string {
  return MSG_DELETE_FAILED;
}

export { formatUserError as formatDbError } from "./userError";
