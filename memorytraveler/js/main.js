import { createAppContext } from "./app/appContext.js";
import { createRouter } from "./ui/router.js";
import { $ } from "./ui/dom.js";
import { initSettingsScreen } from "./ui/screens/settingsScreen.js";
import { initOutlineScreen } from "./ui/screens/outlineScreen.js";
import { initGameScreen } from "./ui/screens/gameScreen.js";
import { initEndingScreen } from "./ui/screens/endingScreen.js";
import { initAlbumScreen } from "./ui/screens/albumScreen.js";
import { initThemeSwitcher } from "./ui/theme.js";

function bootstrap() {
  initThemeSwitcher();
  const ctx = createAppContext();

  const router = createRouter({
    onChange(name) {
      screens[name]?.onShow?.();
    }
  });

  const albumScreen = initAlbumScreen(ctx, router);
  const endingScreen = initEndingScreen(ctx, router, { startNewGame: (outline) => gameScreen.startNewGame(outline) });
  const gameScreen = initGameScreen(ctx, router, { onEndGame: () => endingScreen.begin() });
  const outlineScreen = initOutlineScreen(ctx, router, {
    startNewGame: gameScreen.startNewGame,
    resumeGame: gameScreen.resumeGame
  });
  const settingsScreen = initSettingsScreen(ctx, router);

  const screens = {
    settings: settingsScreen,
    outline: outlineScreen,
    game: gameScreen,
    ending: endingScreen,
    album: albumScreen
  };

  $("navSettings").addEventListener("click", () => router.show("settings"));
  $("navOutline").addEventListener("click", () => router.show("outline"));
  $("navAlbum").addEventListener("click", () => router.show("album"));

  // Guard against losing an in-progress, unfinished playthrough on an
  // accidental tab close / reload — the session itself is persisted after
  // every turn, but a native confirmation is still a useful extra safety net.
  window.addEventListener("beforeunload", (event) => {
    if (ctx.engine && ctx.engine.log.length > 0) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  // "game" and "ending" depend on a live engine instance that only exists
  // after starting or explicitly resuming a session — deep-linking straight
  // into them on a cold load would render an empty screen. Restore the hash
  // only for the stateless screens; game progress is resumed explicitly via
  // the outline screen's resume banner instead.
  const RESTORABLE_ON_LOAD = new Set(["settings", "outline", "album"]);
  const deepLinked = router.currentFromHash();
  if (!ctx.settings.apiKey || !ctx.settings.model) {
    router.show("settings");
  } else if (deepLinked && RESTORABLE_ON_LOAD.has(deepLinked)) {
    router.show(deepLinked);
  } else {
    router.show("outline");
  }
}

bootstrap();
