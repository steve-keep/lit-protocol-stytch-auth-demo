import { useEffect, useState } from "react";
import {
  useStytchUser,
  StytchLogin,
  useStytch,
  useStytchSession,
} from "@stytch/react";
import { Products } from "@stytch/vanilla-js";

import { LogOutButton } from "./components/logout";

import "./App.css";
import useAccounts from "./hooks/use-account";
import useAuthenticate from "./hooks/use-authenticate";
import { addPermittedAuthMethod, runLitAction } from "./utils/lit";

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

function App() {
  const [results, setResults] = useState<string>("");
  const [signatures, setSignatures] = useState<string>("");
  const [hash, setHash] = useState<string>("");
  const { user } = useStytchUser();
  const stytchClient = useStytch();
  const { session } = useStytchSession();

  const { authMethod, authWithLitUsingStytch } = useAuthenticate();
  const { currentAccount, fetchAccounts, createAccount, loading } =
    useAccounts();

  // 1. watch for login to stytch
  useEffect(() => {
    const go = async () => {
      const tokens = await stytchClient.session.getTokens();
      if (tokens?.session_jwt) {
        console.log(
          "Logged in to Stytch, authenticating with lit using stytch session"
        );
        authWithLitUsingStytch(tokens.session_jwt, session?.user_id);
      }
    };
    go();
  }, [stytchClient, session, authWithLitUsingStytch]);

  // 2. watch for authMethod to be set from useAuthenticate
  useEffect(() => {
    // If user is authenticated, fetch accounts
    if (authMethod) {
      console.log("fetching PKPs");
      fetchAccounts(authMethod);
    }
  }, [authMethod, fetchAccounts]);

  if (!user) return <StytchLogin config={config} />;
  if (loading) return <div>Loading...</div>;

  const handleRunLitAction = async () => {
    if (authMethod && currentAccount?.publicKey) {
      const [res, sig] = await runLitAction(authMethod, currentAccount);
      setResults(JSON.stringify(res, null, 2));
      setSignatures(JSON.stringify(sig, null, 2));
    }
  };

  const handleRunTx = async () => {
    if (authMethod && currentAccount) {
      const transaction = await addPermittedAuthMethod(
        authMethod,
        currentAccount
      );

      setHash(transaction.hash);
      setResults(JSON.stringify(transaction, null, 2));
      setSignatures("");
    }
  };

  const handleClaim = async () => {
    if (authMethod) {
      console.log("minting PKP: ", authMethod);
      await createAccount(authMethod);
      console.log("finished minting PKP");
    }
  };

  return (
    <>
      <div className="card">
        <div className="menu">
          {currentAccount ? (
            <>
              <p>
                <button onClick={handleRunLitAction}>Check Permissions</button>
              </p>
              <p>
                <button onClick={handleRunTx}>Add New Auth Method</button>
              </p>
            </>
          ) : (
            <p>
              <button onClick={handleClaim}>Claim & Mint</button>
            </p>
          )}
          <p>
            <LogOutButton />
          </p>
        </div>
        <h3>Response:</h3>
        <pre id="json">{results}</pre>
        <h3>Signatures:</h3>
        <pre id="json">{signatures}</pre>
        <h3>PKP:</h3>
        {currentAccount && (
          <pre id="json">{JSON.stringify(currentAccount, null, 2)}</pre>
        )}
        {hash && (
          <a
            href={`https://lit-protocol.calderaexplorer.xyz/tx/${hash}`}
            target="_blank"
          >
            View TX
          </a>
        )}
      </div>
    </>
  );
}

export default App;
