import { useCallback, useState } from "react";
import { AuthMethod, IRelayPKP, SessionSigs } from "@lit-protocol/types";
import { getSessionSigs } from "../utils/lit";
import { LitAbility, LitActionResource } from "@lit-protocol/auth-helpers";

export default function useSession() {
  const [sessionSigs, setSessionSigs] = useState<SessionSigs>();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error>();

  /**
   * Generate session sigs and store new session data
   */
  const initSession = useCallback(
    async (authMethod: AuthMethod, pkp: IRelayPKP): Promise<void> => {
      setLoading(true);
      setError(undefined);
      console.log("initSession: ", authMethod, pkp);
      try {
        // Prepare session sigs params
        const chain = "ethereum";
        const resourceAbilities = [
          {
            resource: new LitActionResource("*"),
            ability: LitAbility.PKPSigning,
          },
        ];
        const expiration = new Date(
          Date.now() + 1000 * 60 * 60 * 24 * 7
        ).toISOString(); // 1 week

        // Generate session sigs
        const sessionSigs = await getSessionSigs({
          pkpPublicKey: pkp.publicKey,
          authMethod,
          sessionSigsParams: {
            chain,
            expiration,
            resourceAbilityRequests: resourceAbilities,
          },
        });

        console.log(sessionSigs);

        setSessionSigs(sessionSigs);
      } catch (err: unknown) {
        console.log(err);
        if (err instanceof Error) setError(err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    initSession,
    sessionSigs,
    loading,
    error,
  };
}
