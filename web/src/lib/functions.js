// Thin wrappers around the callable Cloud Functions. Every task action goes
// through here so the UI never touches Firestore point data directly.
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

const call = (name) => httpsCallable(functions, name);

export const api = {
  ensureProfile: call("ensureProfile"),
  getMe: call("getMe"),
  setWallet: call("setWallet"),
  setReferrer: call("setReferrer"),
  getLeaderboard: call("getLeaderboard"),

  verifyFaucet: call("verifyFaucet"),
  verifySwap: call("verifySwap"),
  verifyTx: call("verifyTx"),

  submitLink: call("submitLink"),

  setSocialHandle: call("setSocialHandle"),
  submitFollow: call("submitFollow"),
  assignTweet: call("assignTweet"),
  verifyTweetPublic: call("verifyTweetPublic"),

  // Admin
  updateConfig: call("updateConfig"),
  uploadTweets: call("uploadTweets"),
  setTweetActive: call("setTweetActive"),
  listPending: call("listPending"),
  approveSubmission: call("approveSubmission"),
  rejectSubmission: call("rejectSubmission"),
  listUsers: call("listUsers"),
  exportUsersCsv: call("exportUsersCsv"),
  grantAdmin: call("grantAdmin"),
  adjustPoints: call("adjustPoints"),
};

// Turn a Firebase callable error into a friendly message.
export function errMessage(e) {
  return e?.message?.replace(/^.*\/(.*)\)?$/, "$1") || e?.details || "Something went wrong.";
}
