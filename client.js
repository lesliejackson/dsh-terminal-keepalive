/**
 * Keep the right-sidebar terminal mounted across tab and Session switches.
 *
 * The shipped `terminal` tab type does not declare `keepMounted`, so the right
 * sidebar's docking kit destroys its body whenever the tab is hidden. Returning
 * then builds a new xterm, re-attaches to the Host terminal and replays the
 * whole screen snapshot; with a long-running shell or a full-screen TUI that is
 * the visible reload and stutter.
 *
 * The dock reads `keepMounted` from the tab-type definition objects held by
 * `ctx.sidebarRightTabs`, so this bundle forces that flag for the kinds listed
 * below: the definition already registered is patched in place and republished
 * with `refresh()` so bodies on screen re-read it, and a type registered later
 * is patched on the way in. Everything else stays official: the PTY, the output
 * stream, xterm and the Agent terminal tools are untouched, and a switch
 * becomes a plain show/hide.
 *
 * Wrapping is idempotent per registry, and unloading restores the original
 * `register` method and the original flags (including definitions registered
 * while this bundle was active).
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-terminal-keepalive',
  factory() {
    /** Tab kinds to keep mounted. */
    const KINDS = ['terminal']
    /** Marks a registry this bundle already wrapped, so a reload cannot stack wrappers. */
    const WRAPPED = Symbol.for('@local/dsh-terminal-keepalive:wrapped')

    /**
     * Force `keepMounted` on one tab-type definition, recording its previous value.
     *
     * The definition object registered in `ctx.sidebarRightTabs` is the same
     * object the docking kit reads, so the flag is set in place: no copy can
     * outlive the restore below. A definition the type itself already retains
     * (someone else's decision) is left alone and not recorded.
     * @param definition - the definition being inspected or registered.
     * @param originals - previous value per patched definition, for unloading.
     * @returns whether the definition changed.
     */
    function retain(definition, originals) {
      if (definition === null || typeof definition !== 'object') return false
      if (!KINDS.includes(definition.kind) || definition.keepMounted === true) return false
      originals.set(definition, definition.keepMounted)
      definition.keepMounted = true
      return true
    }

    return {
      inject: ['sidebarRightTabs'],
      apply(ctx) {
        ctx.effect(() => {
          const tabs = ctx.sidebarRightTabs
          if (tabs === undefined || tabs[WRAPPED] === true) return
          // The registry is a Client service of this deployment; a future release
          // that changes it must fail loudly instead of half-patching something.
          if (typeof tabs.get !== 'function' || typeof tabs.register !== 'function') {
            console.warn('[terminal-keepalive] sidebarRightTabs has no get/register; leaving the shipped terminal behavior alone')
            return
          }
          /** Previous `keepMounted` of every definition this bundle patched. */
          const originals = new Map()
          let changed = false
          for (const kind of KINDS) {
            if (retain(tabs.get(kind), originals)) changed = true
          }
          const ownRegister = Object.prototype.hasOwnProperty.call(tabs, 'register')
          const register = tabs.register
          tabs.register = function patchedRegister(definition) {
            retain(definition, originals)
            return register.call(this, definition)
          }
          tabs[WRAPPED] = true
          const republish = () => {
            if (typeof tabs.refresh === 'function') tabs.refresh()
          }
          if (changed) republish()
          return () => {
            delete tabs[WRAPPED]
            if (ownRegister) tabs.register = register
            else delete tabs.register
            for (const [definition, keepMounted] of originals) {
              if (keepMounted === undefined) delete definition.keepMounted
              else definition.keepMounted = keepMounted
            }
            originals.clear()
            republish()
          }
        }, '@local/dsh-terminal-keepalive: keep terminal mounted')
      },
    }
  },
})
