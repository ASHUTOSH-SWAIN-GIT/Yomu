import { createContext, useContext } from "react";
import { create, useStore, type StoreApi } from "zustand";
import type { ChatStore } from "@/stores/chat-store";
import type { CommentsStore } from "@/stores/comments-store";
import type { ImageStore } from "@/stores/image-store";
import type { LibraryChatStore } from "@/stores/library-chat-store";
import type { ReaderStore } from "@/stores/reader-store";
import type { ViewStore } from "@/stores/view-store";

/**
 * Tabs. Each tab has its own copy of the stores that describe what is on
 * screen (the open blog, its chat, its comments, the universal chat, ...),
 * so a reply can keep streaming in one tab while you read in another.
 *
 * A store module registers how to build its copy with `registerPart`, and
 * exports a hook made by `tabStore`. Inside a tab's page the hook reads
 * that tab's copy; elsewhere (the sidebar, the top bar, shortcuts) it reads
 * the active tab's copy.
 */
export interface TabParts {
  view: ViewStore;
  reader: ReaderStore;
  chat: ChatStore;
  libraryChat: LibraryChatStore;
  comments: CommentsStore;
  images: ImageStore;
}

export interface TabBundle {
  id: string;
  parts: { [K in keyof TabParts]?: StoreApi<TabParts[K]> };
  /** Undoes what a part set up (agent event listeners, subscriptions). */
  cleanups: (() => void)[];
}

type Creator<K extends keyof TabParts> = (
  bundle: TabBundle,
) => StoreApi<TabParts[K]>;

const creators: { [K in keyof TabParts]?: Creator<K> } = {};
/** Parts that follow other parts from the moment a tab exists (the chat
 * follows the open blog), so they cannot wait to be asked for. */
const eager = new Set<keyof TabParts>();

export function registerPart<K extends keyof TabParts>(
  key: K,
  create: Creator<K>,
  options: { eager?: boolean } = {},
) {
  (creators as Record<string, unknown>)[key] = create;
  if (options.eager) eager.add(key);
}

/** A tab's copy of one store, built the first time it is asked for. A part
 * can ask for another (the chat needs the reader), in any order. */
export function partOf<K extends keyof TabParts>(
  bundle: TabBundle,
  key: K,
): StoreApi<TabParts[K]> {
  const existing = bundle.parts[key];
  if (existing) return existing as StoreApi<TabParts[K]>;
  const create = creators[key] as Creator<K> | undefined;
  if (!create) throw new Error(`tab part "${key}" is not registered`);
  const part = create(bundle);
  (bundle.parts as Record<string, unknown>)[key] = part;
  return part;
}

let counter = 0;
const bundles = new Map<string, TabBundle>();

function newBundle(): TabBundle {
  counter += 1;
  const bundle: TabBundle = { id: `tab-${counter}`, parts: {}, cleanups: [] };
  bundles.set(bundle.id, bundle);
  return bundle;
}

interface TabsState {
  ids: string[];
  activeId: string;
}

export const useTabsStore = create<TabsState>(() => {
  const first = newBundle();
  return { ids: [first.id], activeId: first.id };
});

export function bundleOf(id: string): TabBundle {
  const bundle = bundles.get(id);
  if (!bundle) throw new Error(`no tab ${id}`);
  eager.forEach((key) => partOf(bundle, key));
  return bundle;
}

/** Every open tab, in order. */
export function allBundles(): TabBundle[] {
  return useTabsStore.getState().ids.map(bundleOf);
}

export function activeBundle(): TabBundle {
  return bundleOf(useTabsStore.getState().activeId);
}

/** Stops what a tab is doing and lets go of it. */
function dispose(bundle: TabBundle) {
  void bundle.parts.chat?.getState().stop();
  void bundle.parts.libraryChat?.getState().stop();
  bundle.cleanups.forEach((fn) => fn());
  bundles.delete(bundle.id);
}

/** Opens an empty tab next to the active one and switches to it. */
export function openTab(): TabBundle {
  const bundle = newBundle();
  useTabsStore.setState((s) => {
    const at = s.ids.indexOf(s.activeId) + 1;
    return {
      ids: [...s.ids.slice(0, at), bundle.id, ...s.ids.slice(at)],
      activeId: bundle.id,
    };
  });
  refreshChatList(bundle);
  return bundle;
}

export function activateTab(id: string) {
  if (!bundles.has(id) || useTabsStore.getState().activeId === id) return;
  useTabsStore.setState({ activeId: id });
  refreshChatList(bundleOf(id));
}

/** Closes a tab; the last one is not closed but emptied. */
export function closeTab(id: string) {
  const { ids, activeId } = useTabsStore.getState();
  const bundle = bundles.get(id);
  if (!bundle) return;
  if (ids.length === 1) return resetTabs();
  const at = ids.indexOf(id);
  const rest = ids.filter((x) => x !== id);
  const next = id === activeId ? rest[Math.min(at, rest.length - 1)] : activeId;
  useTabsStore.setState({ ids: rest, activeId: next });
  dispose(bundle);
  refreshChatList(bundleOf(next));
}

/** Back to a single empty tab (after "delete everything"). */
export function resetTabs() {
  const old = [...bundles.values()];
  const fresh = newBundle();
  useTabsStore.setState({ ids: [fresh.id], activeId: fresh.id });
  old.forEach(dispose);
}

export function switchTab(by: 1 | -1) {
  const { ids, activeId } = useTabsStore.getState();
  if (ids.length < 2) return;
  const at = ids.indexOf(activeId);
  activateTab(ids[(at + by + ids.length) % ids.length]);
}

/** The saved-chats list is loaded per tab, so a tab that was in the
 * background may be out of date when you come back to it. */
function refreshChatList(bundle: TabBundle) {
  if (creators.libraryChat) {
    void partOf(bundle, "libraryChat").getState().loadChats();
  }
}

const TabContext = createContext<TabBundle | null>(null);
export const TabProvider = TabContext.Provider;

/** The tab a component belongs to: its own page's tab, or the active one
 * for the parts of the window that are shared (sidebar, top bar). */
export function useTabBundle(): TabBundle {
  const own = useContext(TabContext);
  // Inside a tab this is always null, so a tab switch re-renders nobody there.
  const activeId = useTabsStore((s) => (own ? null : s.activeId));
  return own ?? bundleOf(activeId as string);
}

/** Whether the tab a component belongs to is the one on screen. */
export function useIsActiveTab(): boolean {
  const own = useContext(TabContext);
  return useTabsStore((s) => !own || s.activeId === own.id);
}

type Setter<S> = Partial<S> | ((state: S) => Partial<S>);

/** The hook for one kind of store, with `getState`/`setState`/`subscribe`
 * acting on the active tab (for code that runs on a user action). */
export function tabStore<K extends keyof TabParts>(key: K) {
  type S = TabParts[K];
  function useIt(): S;
  function useIt<U>(selector: (state: S) => U): U;
  function useIt<U>(selector?: (state: S) => U) {
    const api = partOf(useTabBundle(), key);
    return useStore(api, (selector ?? ((s: S) => s)) as (state: S) => U);
  }
  const active = () => partOf(activeBundle(), key);
  return Object.assign(useIt, {
    getState: (): S => active().getState(),
    setState: (patch: Setter<S>) => active().setState(patch as never),
    subscribe: (listener: (state: S, prev: S) => void) =>
      active().subscribe(listener),
  });
}
