/** Shapes returned by the web app's server actions, shared with the client components. */
export type DineInResult = { ok: true; number: string; total: number } | { ok: false; error: string };

export interface PickupState {
  error?: string;
  values?: Record<string, string>;
}

export interface ReserveState {
  error?: string;
  values?: Record<string, string>;
}
