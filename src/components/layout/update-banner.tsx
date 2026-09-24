import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Button } from "@/components/ui/button";
import { logError } from "@/lib/log";

/**
 * Checks the release feed once at startup (ROADMAP.md M6 auto update).
 * Updates are signature checked by the Tauri updater against the public
 * key in tauri.conf.json. Silent when there's nothing new or the check
 * fails (offline, no release yet, dev build).
 */
export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    check()
      .then(setUpdate)
      .catch((err) => logError("update check failed", err));
  }, []);

  if (!update) return null;

  async function install() {
    setInstalling(true);
    try {
      await update!.downloadAndInstall();
      await relaunch();
    } catch (err) {
      logError("update install failed", err);
      setInstalling(false);
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">
        Yomu {update.version} is available
      </span>
      <Button size="sm" disabled={installing} onClick={() => void install()}>
        {installing ? "Installing…" : "Update and restart"}
      </Button>
    </div>
  );
}
