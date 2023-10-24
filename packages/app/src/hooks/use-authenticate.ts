import { useCallback, useState } from "react";
import { AuthMethod } from "@lit-protocol/types";
import { authenticateWithStytch } from "../utils/lit";

export default function useAuthenticate() {
  const [authMethod, setAuthMethod] = useState<AuthMethod>();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error>();

  /**
   * Authenticate with Stytch
   */
  const authWithLitUsingStytch = useCallback(
    async (accessToken: string, userId?: string): Promise<void> => {
      setLoading(true);
      setError(undefined);
      setAuthMethod(undefined);

      console.log(accessToken, userId);

      try {
        const result: AuthMethod = await authenticateWithStytch(
          accessToken,
          userId
        );
        console.log(result);
        setAuthMethod(result);
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
    authWithLitUsingStytch,
    authMethod,
    loading,
    error,
  };
}
