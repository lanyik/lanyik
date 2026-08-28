// The generator version is deliberately isolated from chunk encoding and
// worker protocol modules. Generation rules may depend on it, while those
// modules depend on the rules; keeping the value here prevents a dependency
// cycle and gives every identity/checksum path one authoritative constant.
export const WORLD_GENERATOR_VERSION = 3;
