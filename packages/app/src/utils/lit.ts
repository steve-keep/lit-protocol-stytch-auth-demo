import { LitAuthClient } from "@lit-protocol/lit-auth-client";
import { AuthMethodType, ProviderType } from "@lit-protocol/constants";
import {
  AuthMethod,
  ClaimRequest,
  ClaimResult,
  ClientClaimProcessor,
  GetSessionSigsProps,
  IRelayPKP,
  SessionSigs,
} from "@lit-protocol/types";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import { ethers } from "ethers";
import { PKPHelper } from "@lit-protocol/contracts-sdk/src/abis/PKPHelper.sol/PKPHelper";
import { decode } from "bs58";
import { PKPEthersWallet } from "@lit-protocol/pkp-ethers";
import { LibPKPPermissionsStorage } from "@lit-protocol/contracts-sdk/src/abis/PKPPermissions.sol/PKPPermissions";

export const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN || "localhost";
export const ORIGIN =
  process.env.NEXT_PUBLIC_VERCEL_ENV === "production"
    ? `https://${DOMAIN}`
    : `http://${DOMAIN}:3000`;

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
 * Generate session sigs for given params
 */
export async function getSessionSigs({
  pkpPublicKey,
  authMethod,
  sessionSigsParams,
}: {
  pkpPublicKey: string;
  authMethod: AuthMethod;
  sessionSigsParams: GetSessionSigsProps;
}): Promise<SessionSigs> {
  const provider = getProviderByAuthMethod(authMethod);
  if (provider) {
    const sessionSigs = await provider.getSessionSigs({
      pkpPublicKey,
      authMethod,
      sessionSigsParams,
    });
    return sessionSigs;
  } else {
    throw new Error(
      `Provider not found for auth method type ${authMethod.authMethodType}`
    );
  }
}

export async function updateSessionSigs(
  params: GetSessionSigsProps
): Promise<SessionSigs> {
  const sessionSigs = await litNodeClient.getSessionSigs(params);
  return sessionSigs;
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

export async function addPermittedAuthMethod(
  sessionSigs: SessionSigs,
  pkp: IRelayPKP
) {
  const pkpWallet = new PKPEthersWallet({
    controllerSessionSigs: sessionSigs,
    litActionIPFS: import.meta.env.VITE_ACTION_CODE_IPFS_ID,
    litNetwork: "cayenne",
    pkpPubKey: pkp.publicKey,
  });
  console.log("pkpWallet.address::", pkpWallet.address);
  await pkpWallet.init();

  const litContracts = new LitContracts({
    signer: pkpWallet,
  });
  await litContracts.connect();

  const newAuthMethod: LibPKPPermissionsStorage.AuthMethodStruct = {
    authMethodType: AuthMethodType.StytchOtp,
    id: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test")),
    userPubkey: "0x",
  };
  const mockTransaction =
    await litContracts.pkpPermissionsContract.write.populateTransaction.addPermittedAuthMethod(
      pkp.tokenId,
      newAuthMethod,
      []
    );

  console.log("mockTransaction:: ", mockTransaction);

  // Then, estimate gas on the unsigned transaction
  const gas = await litContracts.signer.estimateGas(mockTransaction);

  console.log("gas:: ", gas);

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
  // const pKey = ethers.Wallet.createRandom();
  // console.log(pKey.address);
  // console.log(pKey.privateKey);

  const provider = getProviderByAuthMethod(authMethod);
  if (!provider) throw new Error("provider undefined");

  const authMethodId = await provider.getAuthMethodId(authMethod);
  const ipfsId = decode(import.meta.env.VITE_ACTION_CODE_IPFS_ID);

  const claimArgs: PKPHelper.AuthMethodDataStruct = {
    permittedAddresses: [], //address[] permittedAddresses;
    permittedAddressScopes: [], //uint256[][] permittedAddressScopes;
    keyType: ethers.BigNumber.from("2"), //uint256 keyType;
    permittedAuthMethodIds: [authMethodId], //bytes[] permittedAuthMethodIds;
    permittedAuthMethodTypes: [AuthMethodType.StytchOtp], //uint256[] permittedAuthMethodTypes;
    permittedAuthMethodPubkeys: ["0x"], //bytes[] permittedAuthMethodPubkeys;
    permittedAuthMethodScopes: [[ethers.BigNumber.from("1")]], //uint256[][] permittedAuthMethodScopes;
    permittedIpfsCIDs: [`0x${Buffer.from(ipfsId).toString("hex")}`],
    permittedIpfsCIDScopes: [[ethers.BigNumber.from("1")]],
    addPkpEthAddressAsPermittedAddress: false, //bool addPkpEthAddressAsPermittedAddress;
    sendPkpToItself: true, //bool sendPkpToItself;
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
