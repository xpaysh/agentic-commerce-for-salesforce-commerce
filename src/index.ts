/**
 * Public package entry. Exports the adapter + the request handler factory
 * for use as a library (e.g. embedded in another Node service).
 */

export { SfccAdapter, NotImplementedError } from "./adapter";
export type { SfccAdapterOptions } from "./adapter";
export { SfccClient, SfccError } from "./sfcc-client";
export { loadConfig } from "./config";
export type { AppConfig, SfccCredentials } from "./config";
export { buildHandler } from "./server";
export * as mappers from "./mappers";
