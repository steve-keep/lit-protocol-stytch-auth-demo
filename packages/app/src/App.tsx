import { useEffect, useState } from "react";
import {
  LitNodeClient,
  checkAndSignAuthMessage,
} from "@lit-protocol/lit-node-client";
import {
  useStytchUser,
  StytchLogin,
  useStytch,
  useStytchSession,
} from "@stytch/react";
import { Products } from "@stytch/vanilla-js";

import { LogOutButton } from "./components/logout";

import pkpJson from "./pkp.json";

import "./App.css";
import useSession from "./hooks/use-session";
import useAccounts from "./hooks/use-account";
import useAuthenticate from "./hooks/use-authenticate";
import { SessionSigs } from "@lit-protocol/types";

const code = `const go = async () => {
  const tokenId = Lit.Actions.pubkeyToTokenId({ publicKey });
  const userId = new TextEncoder("utf-8").encode(Lit.Auth.authMethodContexts?.[0]?.userId);

  const response = {
    tokenId,
    auth: Lit.Auth,
    toSign,
    publicKey,
    sigName,
    sigShare: await Lit.Actions.signEcdsa({ toSign, publicKey, sigName }),
    permittedActions: await Lit.Actions.getPermittedActions({tokenId}),
    permittedAddresses: await Lit.Actions.getPermittedAddresses({tokenId}),
    permittedAuthMethods: await Lit.Actions.getPermittedAuthMethods({tokenId}),
  };

  const permittedAuthMethodScopes = await Lit.Actions.getPermittedAuthMethodScopes({
    tokenId,
    authMethodType: "9",
    userId,
    maxScopeId: 10
  });
  response.permittedAuthMethodScopes = permittedAuthMethodScopes;

  Lit.Actions.setResponse({ response: JSON.stringify(response, null, 2) });
};

go();`;

const runLitAction = async (
  accessToken: string,
  sessionSigs: SessionSigs,
  publicKey: string
) => {
  // you need an AuthSig to auth with the nodes
  // this will get it from MetaMask or any browser wallet
  //const authSig = await checkAndSignAuthMessage({ chain: "ethereum" });

  const litNodeClient = new LitNodeClient({ litNetwork: "cayenne" });
  await litNodeClient.connect();
  const results = await litNodeClient.executeJs({
    //ipfsId: "QmNW37vn2zujd1Xxk5VB5Jp1uWbjCJaj5j6boWzAU5RyAy",
    code: code,
    sessionSigs,
    authMethods: [
      {
        accessToken,
        authMethodType: 9, // Stytch
      },
    ],
    jsParams: {
      // this is the string "Hello World" for testing
      toSign: [72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100],
      publicKey,
      sigName: "sig1",
    },
  });
  console.log(results);
  return results.response;
};

function App() {
  const [results, setResults] = useState<string>("");
  const { user } = useStytchUser();
  const stytchClient = useStytch();
  const { session } = useStytchSession();

  const { authMethod, authWithStytch } = useAuthenticate();
  const { initSession, sessionSigs } = useSession();
  const { currentAccount, fetchAccounts } = useAccounts();

  // 1. watch for login to stytch
  useEffect(() => {
    const go = async () => {
      const tokens = await stytchClient.session.getTokens();
      console.log(tokens);
      if (tokens?.session_jwt) {
        console.log(
          "Logged in to Stytch, authenticating with lit using stytch session"
        );
        authWithStytch(tokens.session_jwt, session?.user_id);
      }
    };
    go();
  }, [stytchClient, session, authWithStytch]);

  // 2. watch for authMethod to be set from useAuthenticate
  useEffect(() => {
    // If user is authenticated, fetch accounts
    if (authMethod) {
      console.log("fetching accounts");
      fetchAccounts(authMethod);
    }
  }, [authMethod, fetchAccounts]);

  // 3. watch for currentAccount to be set from useAccounts
  useEffect(() => {
    // If user is authenticated and has at least one account, initialize session
    if (authMethod && currentAccount) {
      console.log("initializing session");
      initSession(authMethod, currentAccount);
    }
  }, [authMethod, currentAccount, initSession]);

  // This should be used to sign messages
  console.log(currentAccount);

  // This should be used to sign messages
  console.log(sessionSigs);

  // Can be used to check the factors on the session
  console.log(session?.authentication_factors.length);

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

    if (tokens?.session_jwt && sessionSigs && currentAccount?.publicKey) {
      const res = await runLitAction(
        tokens?.session_jwt,
        sessionSigs,
        currentAccount.publicKey
      );
      setResults(res);
    }
  };

  const handlePermitAddress = () => {
    //0x4Adffe82A2EE7468551cC375BA464912Ea652bd6
    console.log("0x4adffe82a2ee7468551cc375ba464912ea652bd6");
  };

  return (
    <>
      <div className="card">
        <button onClick={handleRunLitAction}>executeJs</button>
        <button onClick={handlePermitAddress}>permitAddress</button>
        <p>
          <LogOutButton />
        </p>

        <pre id="json">{results}</pre>
      </div>
    </>
  );
}

export default App;
