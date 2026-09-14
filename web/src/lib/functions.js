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
  setDisplayName: call("setDisplayName"),
  getMyReferrals: call("getMyReferrals"),
  getLeaderboard: call("getLeaderboard"),

  claimFaucet: call("claimFaucet"),
  verifyTxHash: call("verifyTxHash"),

  submitLink: call("submitLink"),

  setSocialHandle: call("setSocialHandle"),
  submitFollow: call("submitFollow"),
  assignTweet: call("assignTweet"),
  verifyTweetPublic: call("verifyTweetPublic"),
  xAuthStart: call("xAuthStart"),
  xLoginStart: call("xLoginStart"),

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
  adminStats: call("adminStats"),
};

// Turn a Firebase callable error into a friendly message.
export function errMessage(e) {
  return e?.message?.replace(/^.*\/(.*)\)?$/, "$1") || e?.details || "Something went wrong.";
}
