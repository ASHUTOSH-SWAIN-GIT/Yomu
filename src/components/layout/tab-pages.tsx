import { ReaderView } from "@/components/layout/reader-view";
import { cn } from "@/lib/utils";
import { TabProvider, bundleOf, useTabsStore } from "@/stores/tabs";

/** Every tab's page, all kept mounted so a reply keeps streaming and the
 * scroll position stays put in the tabs you are not looking at. Only the
 * active tab is visible and reachable. */
export function TabPages() {
  const ids = useTabsStore((s) => s.ids);
  const activeId = useTabsStore((s) => s.activeId);
  return (
    <>
      {ids.map((id) => {
        const active = id === activeId;
        return (
          <TabProvider key={id} value={bundleOf(id)}>
            <div
              data-tab-active={active}
              inert={!active}
              className={cn("absolute inset-0", !active && "invisible")}
            >
              <ReaderView />
            </div>
          </TabProvider>
        );
      })}
    </>
  );
}
