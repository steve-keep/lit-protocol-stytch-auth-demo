import { useEffect, useState } from "react";
import { LitNodeClient } from "@lit-protocol/lit-node-client";
import {
  useStytchUser,
  StytchLogin,
  useStytch,
  useStytchSession,
} from "@stytch/react";
import { Products } from "@stytch/vanilla-js";
import { ethers } from "ethers";

import { LogOutButton } from "./components/logout";

import "./App.css";
import useSession from "./hooks/use-session";
import useAccounts from "./hooks/use-account";
import useAuthenticate from "./hooks/use-authenticate";
import { SessionSigs } from "@lit-protocol/types";
import { PKPEthersWallet } from "@lit-protocol/pkp-ethers";
import { LitContracts } from "@lit-protocol/contracts-sdk";

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
      toSign: ethers.utils.arrayify(
        ethers.utils.keccak256(new TextEncoder().encode("Hello World"))
      ),
      publicKey,
      sigName: "sig1",
    },
  });
  console.log(results);
  return [results.response, results.signatures];
};

function App() {
  const [results, setResults] = useState<string>("");
  const [signatures, setSignatures] = useState<string>("");
  const { user } = useStytchUser();
  const stytchClient = useStytch();
  const { session } = useStytchSession();

  const { authMethod, authWithLitUsingStytch } = useAuthenticate();
  const { initSession, sessionSigs } = useSession();
  const { currentAccount, fetchAccounts, createAccount } = useAccounts();

  // 1. watch for login to stytch
  useEffect(() => {
    const go = async () => {
      const tokens = await stytchClient.session.getTokens();
      console.log(tokens);
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
  console.log("currentAccount:: ", currentAccount);

  // This should be used to sign messages
  console.log(`sessionSigs:: `, sessionSigs);

  // Can be used to check the factors on the session
  console.log("authentication_factors:: ", session?.authentication_factors);

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
      const [res, sig] = await runLitAction(
        tokens?.session_jwt,
        sessionSigs,
        currentAccount.publicKey
      );
      setResults(JSON.stringify(res, null, 2));
      setSignatures(JSON.stringify(sig, null, 2));
    }
  };

  console.log(
    "userId to add:",
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`test`))
  );

  const handleRunTx = async () => {
    if (sessionSigs && currentAccount?.publicKey) {
      const pkpWallet = new PKPEthersWallet({
        controllerSessionSigs: sessionSigs,
        litActionCode: code,
        litNetwork: "cayenne",
        pkpPubKey: currentAccount.publicKey,
      });
      await pkpWallet.init();

      const litContracts = new LitContracts({
        signer: pkpWallet,
      });
      await litContracts.connect();

      const newAuthMethod = {
        authMethodType: 9,
        id: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test")),
        userPubkey: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("0x")),
      };
      // const mockTransaction =
      //   await litContracts.pkpPermissionsContract.write.populateTransaction.addPermittedAuthMethod(
      //     currentAccount.tokenId,
      //     newAuthMethod,
      //     []
      //   );

      // console.log("mockTransaction:: ", mockTransaction);

      // // Then, estimate gas on the unsigned transaction
      // const gas = await litContracts.signer.estimateGas(mockTransaction);

      // console.log("gas:: ", gas);

      const transaction =
        await litContracts.pkpPermissionsContract.write.addPermittedAuthMethod(
          currentAccount.tokenId,
          newAuthMethod,
          []
          // { gasLimit: gas }
        );

      setResults(JSON.stringify(transaction, null, 2));
      setSignatures("");
    }
  };

  console.log(authMethod);

  const handleClaim = async () => {
    if (authMethod) {
      console.log("minting PKP");
      await createAccount(authMethod);
      console.log("finished minting PKP");
    }
  };

  return (
    <>
      <div className="card">
        <p>
          <button onClick={handleClaim}>Mint My PKP</button>
        </p>
        <p>
          <button onClick={handleRunLitAction}>Check Rules</button>
        </p>
        <p>
          <button onClick={handleRunTx}>Add Auth Method</button>
        </p>
        <p>
          <LogOutButton />
        </p>
        <h3>Response</h3>
        <pre id="json">{results}</pre>
        <h3>Signatures</h3>
        <pre id="json">{signatures}</pre>
      </div>
    </>
  );
}

export default App;
