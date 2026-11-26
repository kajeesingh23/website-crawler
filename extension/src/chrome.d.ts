// The small part of the Chrome extension API that Plax uses, typed here so the project needs no extra package.
declare namespace chrome {
  type Tab = { id?: number; windowId: number; url?: string; title?: string; active: boolean; status?: string };
  type Sender = { tab?: Tab; id?: string };
  namespace runtime {
    const id: string;
    function getManifest(): { version: string };
    function getURL(path: string): string;
    function sendMessage<T = unknown>(message: unknown): Promise<T>;
    const onMessage: {
      addListener(fn: (message: never, sender: Sender, reply: (response?: unknown) => void) => boolean | void): void;
    };
  }
  namespace tabs {
    function query(q: { active?: boolean; currentWindow?: boolean; lastFocusedWindow?: boolean; windowType?: string }): Promise<Tab[]>;
    function get(id: number): Promise<Tab>;
    function sendMessage<T = unknown>(tabId: number, message: unknown): Promise<T>;
    function captureVisibleTab(windowId: number, options: { format: "png" | "jpeg" }): Promise<string>;
    function create(p: { url: string }): Promise<Tab>;
    function getCurrent(): Promise<Tab | undefined>;
    const onActivated: { addListener(fn: (info: { tabId: number; windowId: number }) => void): void };
    const onUpdated: { addListener(fn: (tabId: number, change: { status?: string; url?: string }, tab: Tab) => void): void };
  }
  namespace scripting {
    function executeScript(p: { target: { tabId: number }; files: string[] }): Promise<unknown[]>;
  }
  namespace storage {
    const local: {
      get(keys: string | string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  }
  namespace sidePanel {
    function setPanelBehavior(p: { openPanelOnActionClick: boolean }): Promise<void>;
  }
  namespace permissions {
    function request(p: { origins: string[] }): Promise<boolean>;
    function contains(p: { origins: string[] }): Promise<boolean>;
    function remove(p: { origins: string[] }): Promise<boolean>;
  }
}
