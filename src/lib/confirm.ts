/** Confirmación estándar para acciones destructivas o Escape. */
export function confirmAction(message: string): boolean {
  return window.confirm(message);
}

export function confirmDiscard(message = "¿Cerrar sin guardar los cambios?"): boolean {
  return confirmAction(message);
}
