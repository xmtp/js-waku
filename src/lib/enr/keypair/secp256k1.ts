import * as secp from "@noble/secp256k1";

import { randomBytes } from "../../crypto";

import { AbstractKeypair, IKeypair, IKeypairClass, KeypairType } from "./types";

export function secp256k1PublicKeyToCompressed(
  publicKey: Uint8Array
): Uint8Array {
  if (publicKey.length === 64) {
    const _publicKey = new Uint8Array(publicKey.length + 1);
    _publicKey.set([4]);
    _publicKey.set(publicKey, 1);
    publicKey = _publicKey;
  }
  const point = secp.Point.fromHex(publicKey);
  return point.toRawBytes(true);
}

export function secp256k1PublicKeyToFull(publicKey: Uint8Array): Uint8Array {
  if (publicKey.length === 64) {
    const _publicKey = new Uint8Array(publicKey.length + 1);
    _publicKey.set([4]);
    _publicKey.set(publicKey, 1);
    publicKey = _publicKey;
  }
  const point = secp.Point.fromHex(publicKey);

  return point.toRawBytes(false);
}

export function secp256k1PublicKeyToRaw(publicKey: Uint8Array): Uint8Array {
  const point = secp.Point.fromHex(publicKey);
  return point.toRawBytes(false).slice(1);
}

export const Secp256k1Keypair: IKeypairClass = class Secp256k1Keypair
  extends AbstractKeypair
  implements IKeypair
{
  readonly type: KeypairType;

  constructor(privateKey?: Uint8Array, publicKey?: Uint8Array) {
    let pub = publicKey;
    if (pub) {
      pub = secp256k1PublicKeyToCompressed(pub);
    }
    super(privateKey, pub);
    this.type = KeypairType.secp256k1;
  }

  static async generate(): Promise<Secp256k1Keypair> {
    const privateKey = randomBytes(32);
    const publicKey = secp.getPublicKey(privateKey);
    return new Secp256k1Keypair(privateKey, publicKey);
  }

  privateKeyVerify(key = this._privateKey): boolean {
    if (key) {
      return secp.utils.isValidPrivateKey(key);
    }
    return true;
  }

  publicKeyVerify(key = this._publicKey): boolean {
    if (key) {
      try {
        secp.Point.fromHex(key);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }

  async sign(msg: Uint8Array): Promise<Uint8Array> {
    const [signature, recid] = await secp.sign(msg, this.privateKey, {
      recovered: true,
      der: false,
    });

    const result = new Uint8Array(signature.length + 1);
    result.set(signature);
    result.set([recid], signature.length);
    return result;
  }

  verify(msg: Uint8Array, sig: Uint8Array): boolean {
    try {
      const _sig = secp.Signature.fromCompact(sig.slice(0, 64));
      return secp.verify(_sig, msg, this.publicKey);
    } catch {
      return false;
    }
  }
};
