import { LitAuthClient } from "@lit-protocol/lit-auth-client";
import { AuthMethodType, ProviderType } from "@lit-protocol/constants";
import {
  AuthMethod,
  AuthSig,
  ClaimRequest,
  ClaimResult,
  ClientClaimProcessor,
  IRelayPKP,
} from "@lit-protocol/types";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import { ethers } from "ethers";
import { PKPEthersWallet } from "@lit-protocol/pkp-ethers";
import { PKPHelper } from "@lit-protocol/contracts-sdk/src/abis/PKPHelper.sol/PKPHelper";
import { decode } from "bs58";
import { LibPKPPermissionsStorage } from "@lit-protocol/contracts-sdk/src/abis/PKPPermissions.sol/PKPPermissions";
import { SiweMessage } from "siwe";

const litNodeClient = new LitNodeClientNodeJs({
  litNetwork: "cayenne",
  debug: false,
});

export const litAuthClient: LitAuthClient = new LitAuthClient({
  litNodeClient,
  litRelayConfig: {
    relayApiKey: import.meta.env.VITE_LIT_RELAY_API_KEY,
  },
});

/**
 * Get auth method object by validating Stytch JWT
 */
export async function authenticateWithStytch(
  accessToken: string,
  userId?: string
) {
  const provider = litAuthClient.initProvider(ProviderType.StytchOtp, {
    appId: import.meta.env.VITE_STYTCH_PROJECT_ID ?? "",
  });
  const authMethod = await provider?.authenticate({ accessToken, userId });
  return authMethod;
}

/**
 * Fetch PKPs associated with given auth method
 */
export async function getPKPs(authMethod: AuthMethod): Promise<IRelayPKP[]> {
  const provider = getProviderByAuthMethod(authMethod);
  if (!provider) throw new Error("provider undefined");
  const allPKPs = await provider?.fetchPKPsThroughRelayer(authMethod);
  return allPKPs;
}

export async function runLitAction(
  authMethod: AuthMethod,
  pkp: IRelayPKP,
  tx?: string
) {
  const toSign = tx ?? "Hello World";

  const results = await litNodeClient.executeJs({
    authSig: await constructAuthSig(),
    ipfsId: import.meta.env.VITE_ACTION_CODE_IPFS_ID,
    authMethods: [authMethod],
    jsParams: {
      toSign: ethers.utils.arrayify(
        ethers.utils.keccak256(new TextEncoder().encode(toSign))
      ),
      publicKey: pkp.publicKey,
      sigName: "sig1",
    },
  });
  console.log(results);

  return [results.response, results.signatures];
}

export async function addPermittedAuthMethod(
  authMethod: AuthMethod,
  pkp: IRelayPKP
) {
  // 1. Setup the wallet
  const pkpWallet = new PKPEthersWallet({
    controllerAuthSig: await constructAuthSig(),
    // controllerAuthMethods: [authMethod], // Passing this param errors
    litActionIPFS: import.meta.env.VITE_ACTION_CODE_IPFS_ID,
    litNetwork: "cayenne",
    pkpPubKey: pkp.publicKey,
  });

  // 2. Ensure the wallet signs using the action code
  pkpWallet.useAction = true;
  console.log("pkpWallet.address::", pkpWallet.address);
  await pkpWallet.init();

  // 3. Connect to the contracts
  const litContracts = new LitContracts({
    signer: pkpWallet,
  });
  await litContracts.connect();

  // 4. Prepare the auth method payload
  const newAuthMethod: LibPKPPermissionsStorage.AuthMethodStruct = {
    authMethodType: AuthMethodType.StytchOtp,
    id: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test")),
    userPubkey: "0x",
  };

  // 5. Prepare the mock transaction to estimate gas
  const mockTransaction =
    await litContracts.pkpPermissionsContract.write.populateTransaction.addPermittedAuthMethod(
      pkp.tokenId,
      newAuthMethod,
      [ethers.BigNumber.from("2")]
    );
  console.log("mockTransaction:: ", mockTransaction);
  const gas = await litContracts.signer.estimateGas(mockTransaction);
  console.log("gas:: ", gas);

  // 6. Add the auth method by sending the transaction
  return await litContracts.pkpPermissionsContract.write.addPermittedAuthMethod(
    pkp.tokenId,
    newAuthMethod,
    [ethers.BigNumber.from("2")],
    { gasLimit: gas }
  );
}

/**
 * Mint a new PKP for current auth method
 */
export async function mintPKP(authMethod: AuthMethod): Promise<IRelayPKP> {
  const provider = getProviderByAuthMethod(authMethod);
  if (!provider) throw new Error("provider undefined");

  const authMethodId = await provider.getAuthMethodId(authMethod);
  const ipfsId = decode(import.meta.env.VITE_ACTION_CODE_IPFS_ID);

  const claimArgs: PKPHelper.AuthMethodDataStruct = {
    permittedAddresses: [],
    permittedAddressScopes: [],
    keyType: ethers.BigNumber.from("2"),
    permittedAuthMethodIds: [authMethodId],
    permittedAuthMethodTypes: [AuthMethodType.StytchOtp],
    permittedAuthMethodPubkeys: ["0x"],
    permittedAuthMethodScopes: [[ethers.BigNumber.from("0")]],
    permittedIpfsCIDs: [`0x${Buffer.from(ipfsId).toString("hex")}`],
    permittedIpfsCIDScopes: [[ethers.BigNumber.from("1")]],
    addPkpEthAddressAsPermittedAddress: false,
    sendPkpToItself: true,
  };

  console.log("claimArgs: ", claimArgs);

  const claimReq: ClaimRequest<ClientClaimProcessor> = {
    authMethod, // provide an auth method to claim a key Identifier mapped to the given auth method
    signer: new ethers.Wallet(
      import.meta.env.VITE_ETH_PRIVATE_KEY,
      new ethers.providers.JsonRpcProvider(
        "https://chain-rpc.litprotocol.com/http"
      )
    ),
    mintCallback: async (claimRes: ClaimResult<ClientClaimProcessor>) => {
      const litContracts = new LitContracts({ signer: claimRes.signer });
      await litContracts.connect();

      const claimMaterial = {
        keyType: ethers.BigNumber.from("2"),
        derivedKeyId: `0x${claimRes.derivedKeyId}`,
        signatures: claimRes.signatures,
      };

      console.log("claimMaterial: ", claimMaterial);
      const res =
        await litContracts.pkpHelperContract.write.claimAndMintNextAndAddAuthMethods(
          claimMaterial,
          claimArgs,
          {
            value: ethers.utils.parseUnits("1", "wei"),
          }
        );
      console.log(res);
      return res.hash;
    },
  };
  const res = await provider.claimKeyId(claimReq);

  console.log("mint tx hash: ", res.mintTx);
  console.log("pkp public key: ", res.pubkey);

  console.log(res);

  const response = await provider.relay.pollRequestUntilTerminalState(
    res.mintTx
  );
  if (response.status !== "Succeeded") {
    throw new Error("Minting failed");
  }

  const newPKP: IRelayPKP = {
    tokenId: response.pkpTokenId ?? "",
    publicKey: response.pkpPublicKey ?? "",
    ethAddress: response.pkpEthAddress ?? "",
  };
  return newPKP;
}

/**
 * Get provider for given auth method
 */
function getProviderByAuthMethod(authMethod: AuthMethod) {
  switch (authMethod.authMethodType) {
    case AuthMethodType.StytchOtp:
      return litAuthClient.getProvider(ProviderType.StytchOtp);
    default:
      return;
  }
}

export async function constructAuthSig() {
  // Initialize the signer
  const wallet = new ethers.Wallet(import.meta.env.VITE_ETH_PRIVATE_KEY);
  const address = ethers.utils.getAddress(await wallet.getAddress());

  // Craft the SIWE message
  const domain = "localhost";
  const origin = "https://localhost/login";
  const statement =
    "This is a test statement.  You can put anything you want here.";
  const siweMessage = new SiweMessage({
    domain,
    address: address,
    statement,
    uri: origin,
    version: "1",
    chainId: 1,
  });
  const messageToSign = siweMessage.prepareMessage();

  // Sign the message and format the authSig
  const signature = await wallet.signMessage(messageToSign);

  const authSig: AuthSig = {
    sig: signature,
    derivedVia: "web3.eth.personal.sign",
    signedMessage: messageToSign,
    address: address,
  };

  return authSig;
}
