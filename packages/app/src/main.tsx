import React from "react";
import ReactDOM from "react-dom/client";
import { StytchProvider } from "@stytch/react";
import { StytchUIClient } from "@stytch/vanilla-js";

import TokenAuthenticator from "./components/TokenAuthenticator";
import App from "./App.tsx";
import "./index.css";

// We initialize the Stytch client using our project's public token which can be found in the Stytch dashboard
const stytch = new StytchUIClient(import.meta.env.VITE_STYTCH_PUBLIC_TOKEN);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StytchProvider stytch={stytch}>
      <TokenAuthenticator>
        <App />
      </TokenAuthenticator>
    </StytchProvider>
  </React.StrictMode>
);
