import { useCallback } from "react";
import { useStytch } from "@stytch/react";

export const LogOutButton = () => {
  const stytchClient = useStytch();

  const logout = useCallback(() => {
    stytchClient.session.revoke();
  }, [stytchClient]);

  return <button onClick={logout}>Log out</button>;
};
