import { LitAuthClient } from "@lit-protocol/lit-auth-client";
import { AuthMethodType, ProviderType } from "@lit-protocol/constants";
import {
  AuthMethod,
  GetSessionSigsProps,
  IRelayPKP,
  SessionSigs,
} from "@lit-protocol/types";

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

/**
 * Mint a new PKP for current auth method
 */
export async function mintPKP(authMethod: AuthMethod): Promise<IRelayPKP> {
  const provider = getProviderByAuthMethod(authMethod);
  if (!provider) throw new Error("provider undefined");

  const txHash = await provider.mintPKPThroughRelayer(authMethod);

  const response = await provider.relay.pollRequestUntilTerminalState(txHash);
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
