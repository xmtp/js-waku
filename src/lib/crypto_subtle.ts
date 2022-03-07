import nodeCrypto from "crypto";

// Types do not seem up to date
const crypto: Crypto = nodeCrypto.webcrypto as unknown as Crypto;

const subtle: SubtleCrypto = crypto.subtle || crypto.webkitSubtle;

if (subtle === undefined) {
  throw new Error("crypto and/or subtle api unavailable");
}

export { crypto, subtle };
