// IE 11
declare global {
  interface Window {
    msCrypto?: Crypto;
  }

  interface Crypto {
    webkitSubtle?: SubtleCrypto;
  }
}

const crypto = window.crypto || window.msCrypto;
const subtle: SubtleCrypto = crypto.subtle || crypto.webkitSubtle;

if (subtle === undefined) {
  throw new Error("crypto and/or subtle api unavailable");
}

export { crypto, subtle };
