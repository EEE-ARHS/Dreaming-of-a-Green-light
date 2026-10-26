/* Temporary harness: the least DOM a chapter needs to run outside a browser. */

export const listenerLog = { add: 0, remove: 0 };

/** An element that can also receive events, which is all a chapter asks of one. */
export class FakeNode extends EventTarget {
  style: Record<string, string> = {};
  textContent = "";
  innerHTML = "";
  width = 128;
  height = 128;
  private readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string): void => void this.classes.add(name),
    remove: (name: string): void => void this.classes.delete(name),
    contains: (name: string): boolean => this.classes.has(name),
  };
  parentElement: null = null;
  constructor(public id = "") {
    super();
  }
  querySelector(): null {
    return null;
  }
  querySelectorAll(): never[] {
    return [];
  }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  getContext(): unknown {
    return {
      createRadialGradient: () => ({ addColorStop: () => undefined }),
      fillStyle: "",
      fillRect: () => undefined,
    };
  }
  override addEventListener(...args: Parameters<EventTarget["addEventListener"]>): void {
    listenerLog.add += 1;
    super.addEventListener(...args);
  }
  override removeEventListener(...args: Parameters<EventTarget["removeEventListener"]>): void {
    listenerLog.remove += 1;
    super.removeEventListener(...args);
  }
}

const elements = new Map<string, FakeNode>();

export function elementById(id: string): FakeNode {
  const existing = elements.get(id);
  if (existing) return existing;
  const created = new FakeNode(id);
  elements.set(id, created);
  return created;
}

class WindowStub extends FakeNode {
  innerWidth = 1280;
  innerHeight = 720;
  matchMedia = (): { matches: boolean; addEventListener: () => void; removeEventListener: () => void } => ({
    matches: false, addEventListener: () => undefined, removeEventListener: () => undefined,
  });
}

class DocumentStub extends FakeNode {
  documentElement = new FakeNode("html");
  body = new FakeNode("body");
  createElement(tag: string): FakeNode {
    return tag === "canvas" ? new FakeNode("canvas") : new FakeNode(tag);
  }
  getElementById(id: string): FakeNode {
    return elementById(id);
  }
}

const windowStub = new WindowStub("window");
const documentStub = new DocumentStub("document");

(globalThis as Record<string, unknown>).window = windowStub;
(globalThis as Record<string, unknown>).document = documentStub;

export { documentStub as document, windowStub as window };
