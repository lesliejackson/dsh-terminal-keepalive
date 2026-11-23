window.__ModuleLoader__.load({
  id: '@local/dsh-terminal-keepalive',
  factory(require) {
    const { createElement, useLayoutEffect, useMemo } = require('react')
    const TERMINAL = '@deepseek-ai/dsh-client-ui-sidebar-terminal'
    const BODY = 'sidebar.right.pane.tab'

    /**
     * Keep the screen component mounted while releasing its output attachment
     * as soon as a hidden terminal starts producing new frames.
     */
    function manageAttachment(model) {
      let mounted = false
      let visible = false
      let detach
      let unwatch
      let acknowledged = 0
      let pausedRevision

      const stopWatching = () => {
        unwatch?.()
        unwatch = undefined
      }

      const disconnect = () => {
        stopWatching()
        detach?.()
        detach = undefined
      }

      const pauseForOutput = () => {
        const render = model.state.getSnapshot().render
        if (render === undefined || render.revision <= acknowledged) return
        pausedRevision = render.revision
        disconnect()
      }

      const sync = () => {
        if (!mounted) return
        if (visible) {
          stopWatching()
          detach ??= model.mount()
        } else if (detach !== undefined && unwatch === undefined) {
          unwatch = model.state.subscribe(pauseForOutput)
          pauseForOutput()
        }
      }

      return {
        setVisible(value) {
          visible = value
          sync()
        },
        screenState(state, shown) {
          const render = state?.render
          if (render === undefined || (shown && render.revision !== pausedRevision)) return state
          // The detach callback resolves the outstanding frame. The next
          // attachment supplies a new snapshot to the same screen.
          return { ...state, render: undefined }
        },
        view: {
          mount() {
            mounted = true
            sync()
            return () => {
              mounted = false
              disconnect()
            }
          },
          connect: () => model.connect(),
          refresh: () => model.refresh(),
          write: (data, typed) => model.write(data, typed),
          resize: (cols, rows) => model.resize(cols, rows),
          acknowledge(revision) {
            acknowledged = Math.max(acknowledged, revision)
            model.acknowledge(revision)
          },
        },
      }
    }

    function wrapBody(Component) {
      return function RetainedTerminalBody(props) {
        const info = props.useTabInfo()
        const model = props.view(info.tab.id)
        const attachment = useMemo(() => manageAttachment(model), [model])

        useLayoutEffect(() => {
          attachment.setVisible(info.tab.visible)
        }, [attachment, info.tab.visible])

        return createElement(Component, {
          ...props,
          useTabInfo: () => info,
          useTerminal(key) {
            return attachment.screenState(props.useTerminal(key), info.tab.visible)
          },
          view: () => attachment.view,
        })
      }
    }

    function matchesTerminal(entry) {
      return entry.options.key === TERMINAL
    }

    return {
      inject: ['sidebarRightTabs', 'slots'],
      apply(ctx) {
        const { sidebarRightTabs: tabs, slots } = ctx
        if (typeof tabs?.get !== 'function' || typeof tabs.subscribe !== 'function' || typeof tabs.refresh !== 'function'
          || typeof slots?.entries !== 'function' || typeof slots.entriesOfSlot !== 'function'
          || typeof slots.subscribe !== 'function' || typeof slots.register !== 'function') {
          console.warn('[terminal-keepalive] Unsupported sidebar or slot registry')
          return
        }

        ctx.effect(() => {
          let installed
          let stopped = false
          let scheduled = false
          let warned = false
          let failedSource

          const release = () => {
            if (installed === undefined) return
            const { definition, retain, flag, dispose } = installed
            installed = undefined
            dispose()
            if (retain && definition.keepMounted === true) {
              if (flag === undefined) delete definition.keepMounted
              else Object.defineProperty(definition, 'keepMounted', flag)
              tabs.refresh()
            }
          }

          const sync = () => {
            const definition = tabs.get('terminal')
            const winner = () => slots.entriesOfSlot(BODY).find(matchesTerminal)
            const current = winner()
            if (installed !== undefined && installed.definition === definition
              && slots.entries(BODY).includes(installed.source)) {
              if (current?.component === installed.component) return
              // The renderer can fall back to the original entry after a
              // component error. Give it that fallback for this registration.
              if (current === installed.source) failedSource = current
            }

            release()
            if (definition?.id !== TERMINAL) return
            const source = winner()
            if (source === undefined || source === failedSource || (source.options.priority ?? 0) !== 0) return
            if (typeof source.component !== 'function' || typeof source.inject !== 'function'
              || source.locale !== 'sidebarTerminal' || source.children !== undefined || source.store !== undefined) {
              if (!warned) console.warn('[terminal-keepalive] Unsupported terminal body registration')
              warned = true
              return
            }

            const component = wrapBody(source.component)
            const flag = Object.getOwnPropertyDescriptor(definition, 'keepMounted')
            const retain = definition.keepMounted !== true
            let dispose
            try {
              // Keyed slots elect the entry with the lowest priority value.
              dispose = slots.register({
                name: BODY, key: TERMINAL, priority: -1, inject: source.inject, locale: source.locale,
              }, component)
              if (retain) definition.keepMounted = true
              installed = { definition, retain, flag, source, component, dispose }
            } catch (error) {
              dispose?.()
              failedSource = source
              if (!warned) console.warn('[terminal-keepalive] Could not install the terminal body wrapper', error)
              warned = true
              return
            }
            if (retain) tabs.refresh()
          }

          // The sidebar registry publishes synchronously, including from
          // refresh(). Reconcile after it and the slot ledger finish updating.
          const schedule = () => {
            if (scheduled || stopped) return
            scheduled = true
            queueMicrotask(() => {
              scheduled = false
              if (!stopped) sync()
            })
          }
          const unsubscribeTabs = tabs.subscribe(schedule)
          const unsubscribeSlots = slots.subscribe(BODY, schedule)
          schedule()
          return () => {
            stopped = true
            unsubscribeTabs()
            unsubscribeSlots()
            release()
          }
        }, '@local/dsh-terminal-keepalive: retain the terminal screen')
      },
    }
  },
})
