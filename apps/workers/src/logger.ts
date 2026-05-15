// Minimal structured logger interface used by processors. Decouples them
// from pino's generic Logger<Level> shape, which under strict TS does not
// unify cleanly with our typed-config setup.
export interface AppLogger {
  info(obj: object, msg?: string): void;
  info(msg: string): void;
  warn(obj: object, msg?: string): void;
  warn(msg: string): void;
  error(obj: object, msg?: string): void;
  error(msg: string): void;
  debug(obj: object, msg?: string): void;
  debug(msg: string): void;
}
