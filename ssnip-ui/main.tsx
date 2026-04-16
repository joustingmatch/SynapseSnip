import ReactDOM from "react-dom/client";
import type { ComponentType } from "react";
import { ToastProvider } from "./components/Toast";
import "./index.css";

const hash = window.location.hash;
const isTransparentRoute =
  hash.startsWith("#overlay") ||
  hash.startsWith("#notification") ||
  hash.startsWith("#video-notification") ||
  hash.startsWith("#floating");

if (isTransparentRoute) {
  document.documentElement.classList.add("route-transparent");
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}

type RootComponent = ComponentType;

async function loadRouteComponent(): Promise<RootComponent> {
  if (hash.startsWith("#overlay")) {
    const mod = await import("./routes/OverlayPage");
    return mod.OverlayPage;
  }
  if (hash.startsWith("#notification")) {
    const mod = await import("./routes/NotificationPage");
    return mod.NotificationPage;
  }
  if (hash.startsWith("#editor")) {
    const mod = await import("./routes/EditorPage");
    return mod.EditorPage;
  }
  if (hash.startsWith("#floating")) {
    const mod = await import("./routes/FloatingImagePage");
    return mod.FloatingImagePage;
  }
  if (hash.startsWith("#video-notification")) {
    const mod = await import("./routes/VideoNotificationPage");
    return mod.VideoNotificationPage;
  }
  const mod = await import("./App");
  return mod.default;
}

const root = ReactDOM.createRoot(document.getElementById("root")!);

loadRouteComponent()
  .then((Component) => {
    root.render(
      <ToastProvider>
        <Component />
      </ToastProvider>
    );
  })
  .catch((error) => {
    console.error("Failed to load route", error);
    root.render(<div />);
  });
