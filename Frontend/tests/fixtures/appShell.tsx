import React from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App";
import { ConfirmationProvider } from "../../src/components/UI";
import { tokenStore } from "../../src/lib/api";
import "../../src/index.css";

const root = createRoot(document.getElementById("root")!);
let role = "Admin";
let generation = 0;
window.fetch = async (input) => {
  const path = String(input);
  if (path === "/api/me") return new Response(JSON.stringify({ id: role === "Admin" ? "admin" : "teacher", displayName: `${role} sintético`, email: "", roles: [role] }));
  if (path === "/api/auth/institutional/config") return new Response(JSON.stringify({ enabled: false }));
  if (path === "/api/notifications/unread-count") return new Response(JSON.stringify({ count: 0 }));
  return new Response(JSON.stringify([]));
};
const shellTest = {
  reset(nextRole = "Admin") {
    role = nextRole;
    tokenStore.set("synthetic-session");
    root.render(<ConfirmationProvider><App key={++generation} /></ConfirmationProvider>);
  },
};
(window as unknown as { shellTest: typeof shellTest }).shellTest = shellTest;
(window as unknown as { adminTest: typeof shellTest }).adminTest = shellTest;
shellTest.reset();
