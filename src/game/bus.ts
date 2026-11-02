/** A tiny typed-enough event bus so UI, app state and the scene stay decoupled. */

type Handler = (payload?: any) => void

class Bus {
  private handlers = new Map<string, Set<Handler>>()

  on(name: string, handler: Handler): () => void {
    let set = this.handlers.get(name)
    if (!set) {
      set = new Set()
      this.handlers.set(name, set)
    }
    set.add(handler)
    return () => this.off(name, handler)
  }

  off(name: string, handler: Handler): void {
    this.handlers.get(name)?.delete(handler)
  }

  emit(name: string, payload?: any): void {
    const set = this.handlers.get(name)
    if (!set) return
    for (const handler of [...set]) {
      try {
        handler(payload)
      } catch (error) {
        // One broken listener must never stop a shot.
        console.error(`bus handler failed for ${name}`, error)
      }
    }
  }
}

export const bus = new Bus()
