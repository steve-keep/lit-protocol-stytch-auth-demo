import "dotenv/config";
import {
  LitAuthClient,
  StytchOtpProvider,
} from "@lit-protocol/lit-auth-client";
import prompts from "prompts";
import * as stytch from "stytch";
import { LitNodeClientNodeJs } from "@lit-protocol/lit-node-client-nodejs";
import { ProviderType } from "@lit-protocol/constants";

const STYTCH_PROJECT_ID: string | undefined = process.env.STYTCH_PROJECT_ID;
const STYTCH_SECRET: string | undefined = process.env.STYTCH_SECRET;
const LIT_RELAY_API_KEY: string | undefined = process.env.LIT_RELAY_API_KEY;

if (!STYTCH_PROJECT_ID || !STYTCH_SECRET) {
  throw Error("Could not find stytch project secret or id in enviorment");
}

const stytchClient = new stytch.Client({
  project_id: STYTCH_PROJECT_ID,
  secret: STYTCH_SECRET,
});

const emailResponse = await prompts({
  type: "text",
  name: "email",
  message: "Enter your email:",
});

const stytchResponse = await stytchClient.otps.email.loginOrCreate({
  email: emailResponse.email,
});

const otpResponse = await prompts({
  type: "text",
  name: "code",
  message: "Enter the code sent to your email:",
});

const authResponse = await stytchClient.otps.authenticate({
  method_id: stytchResponse.email_id,
  code: otpResponse.code,
  session_duration_minutes: 60 * 24 * 7,
});

const stytchSessionStatus = await stytchClient.sessions.authenticate({
  session_token: authResponse.session_token,
});

console.log(
  "stytch session status: ",
  JSON.stringify(stytchSessionStatus, null, 4)
);

const litNodeClient = new LitNodeClientNodeJs({
  litNetwork: "cayenne",
  debug: false,
});

await litNodeClient.connect();
