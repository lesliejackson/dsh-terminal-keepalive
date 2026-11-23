/**
 * Host half of `@local/dsh-terminal-keepalive`.
 *
 * The behavior lives entirely in the browser: the right sidebar's tab registry
 * and the docking kit that reads it are Client services. This row exists so the
 * bundle can carry its client plugin; the Host has nothing to do.
 */

/** No Host-side behavior. */
export function apply() {}
