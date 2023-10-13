import {
  checkAndSignAuthMessage,
  LitNodeClient,
} from "@lit-protocol/lit-node-client";
import { useStytchUser, StytchLogin, useStytch } from "@stytch/react";
import { Products } from "@stytch/vanilla-js";

import "./App.css";
import { LogOutButton } from "./components/logout";
import { useState } from "react";

// this code will be run on the node
const litActionCode = `
const go = async () => {

  const userId = "user-test-cf821b3a-5673-4da6-9e58-dfeb04c48ecc";
  const match = userId !== Lit.Auth.authMethodContexts?.[0]?.userId;
  
  Lit.Actions.setResponse({response: match ? "no match" : "match"})
};

go();
`;

const runLitAction = async (accessToken: string) => {
  // you need an AuthSig to auth with the nodes
  // this will get it from MetaMask or any browser wallet
  const authSig = await checkAndSignAuthMessage({ chain: "ethereum" });

  const litNodeClient = new LitNodeClient({ litNetwork: "cayenne" });
  await litNodeClient.connect();
  const results = await litNodeClient.executeJs({
    code: litActionCode,
    authSig,
    authMethods: [
      {
        accessToken,
        authMethodType: 9, // Stytch
      },
    ],
    jsParams: {
      // this is the string "Hello World" for testing
      toSign: [72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100],
      publicKey:
        "0x04dc9bbda8b0f99dd9252e2cdd9af08bf7dff898bc96f0eb9a30eeb3b08bfb1b5098f1f627c1c186c49888a947a34dd14d24de74e22c097510e7bc06d587b6026c",
      sigName: "sig1",
    },
  });
  return results.response;
};

function App() {
  const [results, setResults] = useState<string>("");
  const { user } = useStytchUser();
  const stytchClient = useStytch();

  const config = {
    products: [Products.emailMagicLinks, Products.oauth],
    emailMagicLinksOptions: {
      loginRedirectURL: "http://localhost:5173",
      loginExpirationMinutes: 60,
      signupRedirectURL: "http://localhost:5173",
      signupExpirationMinutes: 60,
    },
    oauthOptions: {
      providers: [],
      loginRedirectURL: "http://localhost:5173",
      loginExpirationMinutes: 60,
      signupRedirectURL: "http://localhost:5173",
      signupExpirationMinutes: 60,
    },
  };

  if (!user) return <StytchLogin config={config} />;

  const handleRunLitAction = async () => {
    const tokens = await stytchClient.session.getTokens();
    if (tokens?.session_jwt) {
      const res = await runLitAction(tokens?.session_jwt);
      setResults(res);
    }
  };

  return (
    <>
      <div className="card">
        <button onClick={handleRunLitAction}>executeJs</button>
        <p>
          <LogOutButton />
        </p>
        <p>{results}</p>
      </div>
    </>
  );
}

export default App;
