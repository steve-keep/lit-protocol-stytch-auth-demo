import { useCallback, useState } from "react";
import { AuthMethod } from "@lit-protocol/types";
import { getPKPs, mintPKP } from "../utils/lit";
import { IRelayPKP } from "@lit-protocol/types";

export default function useAccounts() {
  const [accounts, setAccounts] = useState<IRelayPKP[]>([]);
  const [currentAccount, setCurrentAccount] = useState<IRelayPKP>();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error>();

  /**
   * Fetch PKPs tied to given auth method
   */
  const fetchAccounts = useCallback(
    async (authMethod: AuthMethod): Promise<void> => {
      setLoading(true);
      setError(undefined);
      try {
        // Fetch PKPs tied to given auth method
        const myPKPs = await getPKPs(authMethod);
        // console.log('fetchAccounts pkps: ', myPKPs);
        setAccounts(myPKPs);
        // If only one PKP, set as current account
        console.log("fetchAccounts pkps: ", myPKPs);
        if (myPKPs.length >= 1) {
          setCurrentAccount(myPKPs[myPKPs.length - 1]);
        }
      } catch (err: unknown) {
        if (err instanceof Error) setError(err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Mint a new PKP for current auth method
   */
  const createAccount = useCallback(
    async (authMethod: AuthMethod): Promise<void> => {
      setLoading(true);
      setError(undefined);
      try {
        const newPKP = await mintPKP(authMethod);
        console.log("createAccount pkp: ", newPKP);
        setAccounts((prev) => [...prev, newPKP]);
        setCurrentAccount(newPKP);
      } catch (err: unknown) {
        console.log(err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    fetchAccounts,
    createAccount,
    setCurrentAccount,
    accounts,
    currentAccount,
    loading,
    error,
  };
}
