import { assert, expect } from "chai";
import { Multiaddr } from "multiaddr";
import PeerId from "peer-id";

import { getPublicKey } from "../crypto";
import { bytesToHex, hexToBytes, utf8ToBytes } from "../utils";

import { ERR_INVALID_ID } from "./constants";
import { ENR } from "./enr";
import { createKeypairFromPeerId, IKeypair } from "./keypair";
import { Waku2 } from "./waku2_codec";

describe("ENR", function () {
  describe("Txt codec", () => {
    it("should encodeTxt and decodeTxt", async () => {
      const peerId = await PeerId.create({ keyType: "secp256k1" });
      const enr = await ENR.createFromPeerId(peerId);
      const keypair = createKeypairFromPeerId(peerId);
      enr.setLocationMultiaddr(new Multiaddr("/ip4/18.223.219.100/udp/9000"));
      enr.multiaddrs = [
        new Multiaddr(
          "/dns4/node1.do-ams.wakuv2.test.statusim.net/tcp/443/wss"
        ),
        new Multiaddr(
          "/dns6/node2.ac-chi.wakuv2.test.statusim.net/tcp/443/wss"
        ),
        new Multiaddr(
          "/onion3/vww6ybal4bd7szmgncyruucpgfkqahzddi37ktceo3ah7ngmcopnpyyd:1234/wss"
        ),
      ];

      enr.waku2 = {
        relay: true,
        store: false,
        filter: true,
        lightPush: false,
      };

      const txt = await enr.encodeTxt(keypair.privateKey);
      const enr2 = await ENR.decodeTxt(txt);

      if (!enr.signature) throw "enr.signature is undefined";
      if (!enr2.signature) throw "enr.signature is undefined";

      expect(bytesToHex(enr2.signature)).to.be.equal(bytesToHex(enr.signature));
      const multiaddr = enr2.getLocationMultiaddr("udp")!;
      expect(multiaddr.toString()).to.be.equal("/ip4/18.223.219.100/udp/9000");
      expect(enr2.multiaddrs).to.not.be.undefined;
      expect(enr2.multiaddrs!.length).to.be.equal(3);
      const multiaddrsAsStr = enr2.multiaddrs!.map((ma) => ma.toString());
      expect(multiaddrsAsStr).to.include(
        "/dns4/node1.do-ams.wakuv2.test.statusim.net/tcp/443/wss"
      );
      expect(multiaddrsAsStr).to.include(
        "/dns6/node2.ac-chi.wakuv2.test.statusim.net/tcp/443/wss"
      );
      expect(multiaddrsAsStr).to.include(
        "/onion3/vww6ybal4bd7szmgncyruucpgfkqahzddi37ktceo3ah7ngmcopnpyyd:1234/wss"
      );
      expect(enr2.waku2).to.deep.equal({
        relay: true,
        store: false,
        filter: true,
        lightPush: false,
      });
    });

    it("should decode valid enr successfully", async () => {
      const txt =
        "enr:-Ku4QMh15cIjmnq-co5S3tYaNXxDzKTgj0ufusA-QfZ66EWHNsULt2kb0eTHoo1Dkjvvf6CAHDS1Di-htjiPFZzaIPcLh2F0dG5ldHOIAAAAAAAAAACEZXRoMpD2d10HAAABE________x8AgmlkgnY0gmlwhHZFkMSJc2VjcDI1NmsxoQIWSDEWdHwdEA3Lw2B_byeFQOINTZ0GdtF9DBjes6JqtIN1ZHCCIyg";
      const enr = await ENR.decodeTxt(txt);
      const eth2 = enr.get("eth2");
      if (!eth2) throw "eth2 is undefined";
      expect(bytesToHex(eth2)).to.be.equal("f6775d0700000113ffffffffffff1f00");
    });

    it("should decode valid ENR with multiaddrs successfully [shared test vector]", async () => {
      const txt =
        "enr:-QEnuEBEAyErHEfhiQxAVQoWowGTCuEF9fKZtXSd7H_PymHFhGJA3rGAYDVSHKCyJDGRLBGsloNbS8AZF33IVuefjOO6BIJpZIJ2NIJpcIQS39tkim11bHRpYWRkcnO4lgAvNihub2RlLTAxLmRvLWFtczMud2FrdXYyLnRlc3Quc3RhdHVzaW0ubmV0BgG73gMAODcxbm9kZS0wMS5hYy1jbi1ob25na29uZy1jLndha3V2Mi50ZXN0LnN0YXR1c2ltLm5ldAYBu94DACm9A62t7AQL4Ef5ZYZosRpQTzFVAB8jGjf1TER2wH-0zBOe1-MDBNLeA4lzZWNwMjU2azGhAzfsxbxyCkgCqq8WwYsVWH7YkpMLnU2Bw5xJSimxKav-g3VkcIIjKA";
      const enr = await ENR.decodeTxt(txt);

      expect(enr.multiaddrs).to.not.be.undefined;
      expect(enr.multiaddrs!.length).to.be.equal(3);
      const multiaddrsAsStr = enr.multiaddrs!.map((ma) => ma.toString());
      expect(multiaddrsAsStr).to.include(
        "/dns4/node-01.do-ams3.wakuv2.test.statusim.net/tcp/443/wss"
      );
      expect(multiaddrsAsStr).to.include(
        "/dns6/node-01.ac-cn-hongkong-c.wakuv2.test.statusim.net/tcp/443/wss"
      );
      expect(multiaddrsAsStr).to.include(
        "/onion3/vww6ybal4bd7szmgncyruucpgfkqahzddi37ktceo3ah7ngmcopnpyyd:1234/wss"
      );
    });

    it("should decode valid enr with tcp successfully", async () => {
      const txt =
        "enr:-IS4QAmC_o1PMi5DbR4Bh4oHVyQunZblg4bTaottPtBodAhJZvxVlWW-4rXITPNg4mwJ8cW__D9FBDc9N4mdhyMqB-EBgmlkgnY0gmlwhIbRi9KJc2VjcDI1NmsxoQOevTdO6jvv3fRruxguKR-3Ge4bcFsLeAIWEDjrfaigNoN0Y3CCdl8";
      const enr = await ENR.decodeTxt(txt);
      expect(enr.tcp).to.not.be.undefined;
      expect(enr.tcp).to.be.equal(30303);
      expect(enr.ip).to.not.be.undefined;
      expect(enr.ip).to.be.equal("134.209.139.210");
      expect(enr.publicKey).to.not.be.undefined;
      expect(enr.peerId?.toB58String()).to.be.equal(
        "16Uiu2HAmPLe7Mzm8TsYUubgCAW1aJoeFScxrLj8ppHFivPo97bUZ"
      );
    });

    it("should throw error - no id", async () => {
      try {
        const peerId = await PeerId.create({ keyType: "secp256k1" });
        const enr = await ENR.createFromPeerId(peerId);
        const keypair = createKeypairFromPeerId(peerId);
        enr.setLocationMultiaddr(new Multiaddr("/ip4/18.223.219.100/udp/9000"));

        enr.set("id", new Uint8Array([0]));
        const txt = await enr.encodeTxt(keypair.privateKey);

        ENR.decodeTxt(txt);
        assert.fail("Expect error here");
      } catch (err: unknown) {
        const e = err as Error;
        expect(e.message).to.be.equal(ERR_INVALID_ID);
      }
    });

    it("should throw error - no public key", () => {
      try {
        const txt =
          "enr:-IS4QJ2d11eu6dC7E7LoXeLMgMP3kom1u3SE8esFSWvaHoo0dP1jg8O3-nx9ht-EO3CmG7L6OkHcMmoIh00IYWB92QABgmlkgnY0gmlwhH8AAAGJc2d11eu6dCsxoQIB_c-jQMOXsbjWkbN-kj99H57gfId5pfb4wa1qxwV4CIN1ZHCCIyk";
        ENR.decodeTxt(txt);
        assert.fail("Expect error here");
      } catch (err: unknown) {
        const e = err as Error;
        expect(e.message).to.not.be.undefined;
      }
    });
  });

  describe("Verify", () => {
    it("should throw error - no id", async () => {
      try {
        const enr = await ENR.create({}, BigInt(0), new Uint8Array());
        enr.verify(new Uint8Array(), new Uint8Array());
        assert.fail("Expect error here");
      } catch (err: unknown) {
        const e = err as Error;
        expect(e.message).to.be.equal(ERR_INVALID_ID);
      }
    });

    it("should throw error - invalid id", async () => {
      try {
        const enr = await ENR.create(
          { id: utf8ToBytes("v3") },
          BigInt(0),
          new Uint8Array()
        );
        enr.verify(new Uint8Array(), new Uint8Array());
        assert.fail("Expect error here");
      } catch (err: unknown) {
        const e = err as Error;
        expect(e.message).to.be.equal(ERR_INVALID_ID);
      }
    });

    it("should throw error - no public key", async () => {
      try {
        const enr = await ENR.create(
          { id: utf8ToBytes("v4") },
          BigInt(0),
          new Uint8Array()
        );
        enr.verify(new Uint8Array(), new Uint8Array());
        assert.fail("Expect error here");
      } catch (err: unknown) {
        const e = err as Error;
        expect(e.message).to.be.equal("Failed to verify ENR: No public key");
      }
    });

    it("should return false", async () => {
      const txt =
        "enr:-Ku4QMh15cIjmnq-co5S3tYaNXxDzKTgj0ufusA-QfZ66EWHNsULt2kb0eTHoo1Dkjvvf6CAHDS1Di-htjiPFZzaIPcLh2F0dG5ldHOIAAAAAAAAAACEZXRoMpD2d10HAAABE________x8AgmlkgnY0gmlwhHZFkMSJc2VjcDI1NmsxoQIWSDEWdHwdEA3Lw2B_byeFQOINTZ0GdtF9DBjes6JqtIN1ZHCCIyg";
      const enr = await ENR.decodeTxt(txt);
      // should have id and public key inside ENR
      expect(enr.verify(new Uint8Array(32), new Uint8Array(64))).to.be.false;
    });
  });

  describe("Static tests", function () {
    let privateKey: Uint8Array;
    let record: ENR;

    beforeEach(async function () {
      const seq = BigInt(1);
      privateKey = hexToBytes(
        "b71c71a67e1177ad4e901695e1b4b9ee17ae16c6668d313eac2f96dbcda3f291"
      );
      record = await ENR.createV4(getPublicKey(privateKey));
      record.setLocationMultiaddr(new Multiaddr("/ip4/127.0.0.1/udp/30303"));
      record.seq = seq;
      await record.encodeTxt(privateKey);
    });

    it("should properly compute the node id", () => {
      expect(record.nodeId).to.equal(
        "a448f24c6d18e575453db13171562b71999873db5b286df957af199ec94617f7"
      );
    });

    it("should encode/decode to RLP encoding", async function () {
      const decoded = await ENR.decode(await record.encode(privateKey));
      expect(decoded).to.deep.equal(record);
    });

    it("should encode/decode to text encoding", async function () {
      // spec enr https://eips.ethereum.org/EIPS/eip-778
      const testTxt =
        "enr:-IS4QHCYrYZbAKWCBRlAy5zzaDZXJBGkcnh4MHcBFZntXNFrdvJjX04jRzjzCBOonrkTfj499SZuOh8R33Ls8RRcy5wBgmlkgnY0gmlwhH8AAAGJc2VjcDI1NmsxoQPKY0yuDUmstAHYpMa2_oxVtw0RW_QAdpzBQA8yWM0xOIN1ZHCCdl8";
      const decoded = await ENR.decodeTxt(testTxt);
      // Note: Signatures are different due to the extra entropy added
      // by @noble/secp256k1:
      // https://github.com/paulmillr/noble-secp256k1#signmsghash-privatekey
      expect(decoded.udp).to.deep.equal(record.udp);
      expect(decoded.ip).to.deep.equal(record.ip);
      expect(decoded.id).to.deep.equal(record.id);
      expect(decoded.seq).to.equal(record.seq);
      expect(decoded.get("secp256k1")).to.deep.equal(record.get("secp256k1"));
    });
  });

  describe("Multiaddr getters and setters", () => {
    let privateKey: Uint8Array;
    let record: ENR;

    beforeEach(async () => {
      privateKey = hexToBytes(
        "b71c71a67e1177ad4e901695e1b4b9ee17ae16c6668d313eac2f96dbcda3f291"
      );
      record = await ENR.createV4(getPublicKey(privateKey));
    });

    it("should get / set UDP multiaddr", () => {
      const multi0 = new Multiaddr("/ip4/127.0.0.1/udp/30303");
      const tuples0 = multi0.tuples();

      if (!tuples0[0][1] || !tuples0[1][1]) {
        throw new Error("invalid multiaddr");
      }
      // set underlying records
      record.set("ip", tuples0[0][1]);
      record.set("udp", tuples0[1][1]);
      // and get the multiaddr
      expect(record.getLocationMultiaddr("udp")!.toString()).to.equal(
        multi0.toString()
      );
      // set the multiaddr
      const multi1 = new Multiaddr("/ip4/0.0.0.0/udp/30300");
      record.setLocationMultiaddr(multi1);
      // and get the multiaddr
      expect(record.getLocationMultiaddr("udp")!.toString()).to.equal(
        multi1.toString()
      );
      // and get the underlying records
      const tuples1 = multi1.tuples();
      expect(record.get("ip")).to.deep.equal(tuples1[0][1]);
      expect(record.get("udp")).to.deep.equal(tuples1[1][1]);
    });

    it("should get / set TCP multiaddr", () => {
      const multi0 = new Multiaddr("/ip4/127.0.0.1/tcp/30303");
      const tuples0 = multi0.tuples();

      if (!tuples0[0][1] || !tuples0[1][1]) {
        throw new Error("invalid multiaddr");
      }

      // set underlying records
      record.set("ip", tuples0[0][1]);
      record.set("tcp", tuples0[1][1]);
      // and get the multiaddr
      expect(record.getLocationMultiaddr("tcp")!.toString()).to.equal(
        multi0.toString()
      );
      // set the multiaddr
      const multi1 = new Multiaddr("/ip4/0.0.0.0/tcp/30300");
      record.setLocationMultiaddr(multi1);
      // and get the multiaddr
      expect(record.getLocationMultiaddr("tcp")!.toString()).to.equal(
        multi1.toString()
      );
      // and get the underlying records
      const tuples1 = multi1.tuples();
      expect(record.get("ip")).to.deep.equal(tuples1[0][1]);
      expect(record.get("tcp")).to.deep.equal(tuples1[1][1]);
    });
  });

  describe("Location multiaddr", async () => {
    const ip4 = "127.0.0.1";
    const ip6 = "::1";
    const tcp = 8080;
    const udp = 8080;
    let peerId;
    let enr: ENR;

    before(async function () {
      peerId = await PeerId.create({ keyType: "secp256k1" });
      enr = await ENR.createFromPeerId(peerId);
      enr.ip = ip4;
      enr.ip6 = ip6;
      enr.tcp = tcp;
      enr.udp = udp;
      enr.tcp6 = tcp;
      enr.udp6 = udp;
    });

    it("should properly create location multiaddrs - udp4", () => {
      expect(enr.getLocationMultiaddr("udp4")).to.deep.equal(
        new Multiaddr(`/ip4/${ip4}/udp/${udp}`)
      );
    });

    it("should properly create location multiaddrs - tcp4", () => {
      expect(enr.getLocationMultiaddr("tcp4")).to.deep.equal(
        new Multiaddr(`/ip4/${ip4}/tcp/${tcp}`)
      );
    });

    it("should properly create location multiaddrs - udp6", () => {
      expect(enr.getLocationMultiaddr("udp6")).to.deep.equal(
        new Multiaddr(`/ip6/${ip6}/udp/${udp}`)
      );
    });

    it("should properly create location multiaddrs - tcp6", () => {
      expect(enr.getLocationMultiaddr("tcp6")).to.deep.equal(
        new Multiaddr(`/ip6/${ip6}/tcp/${tcp}`)
      );
    });

    it("should properly create location multiaddrs - udp", () => {
      // default to ip4
      expect(enr.getLocationMultiaddr("udp")).to.deep.equal(
        new Multiaddr(`/ip4/${ip4}/udp/${udp}`)
      );
      // if ip6 is set, use it
      enr.ip = undefined;
      expect(enr.getLocationMultiaddr("udp")).to.deep.equal(
        new Multiaddr(`/ip6/${ip6}/udp/${udp}`)
      );
      // if ip6 does not exist, use ip4
      enr.ip6 = undefined;
      enr.ip = ip4;
      expect(enr.getLocationMultiaddr("udp")).to.deep.equal(
        new Multiaddr(`/ip4/${ip4}/udp/${udp}`)
      );
      enr.ip6 = ip6;
    });

    it("should properly create location multiaddrs - tcp", () => {
      // default to ip4
      expect(enr.getLocationMultiaddr("tcp")).to.deep.equal(
        new Multiaddr(`/ip4/${ip4}/tcp/${tcp}`)
      );
      // if ip6 is set, use it
      enr.ip = undefined;
      expect(enr.getLocationMultiaddr("tcp")).to.deep.equal(
        new Multiaddr(`/ip6/${ip6}/tcp/${tcp}`)
      );
      // if ip6 does not exist, use ip4
      enr.ip6 = undefined;
      enr.ip = ip4;
      expect(enr.getLocationMultiaddr("tcp")).to.deep.equal(
        new Multiaddr(`/ip4/${ip4}/tcp/${tcp}`)
      );
      enr.ip6 = ip6;
    });
  });

  describe("waku2 key round trip", async () => {
    let peerId;
    let enr: ENR;
    let waku2Protocols: Waku2;
    let keypair: IKeypair;

    beforeEach(async function () {
      peerId = await PeerId.create({ keyType: "secp256k1" });
      enr = await ENR.createFromPeerId(peerId);
      keypair = createKeypairFromPeerId(peerId);
      waku2Protocols = {
        relay: false,
        store: false,
        filter: false,
        lightPush: false,
      };
    });

    it("should set field with all protocols disabled", async () => {
      enr.waku2 = waku2Protocols;

      const txt = await enr.encodeTxt(keypair.privateKey);
      const decoded = (await ENR.decodeTxt(txt)).waku2!;

      expect(decoded.relay).to.equal(false);
      expect(decoded.store).to.equal(false);
      expect(decoded.filter).to.equal(false);
      expect(decoded.lightPush).to.equal(false);
    });

    it("should set field with all protocols enabled", async () => {
      waku2Protocols.relay = true;
      waku2Protocols.store = true;
      waku2Protocols.filter = true;
      waku2Protocols.lightPush = true;

      enr.waku2 = waku2Protocols;
      const txt = await enr.encodeTxt(keypair.privateKey);
      const decoded = (await ENR.decodeTxt(txt)).waku2!;

      expect(decoded.relay).to.equal(true);
      expect(decoded.store).to.equal(true);
      expect(decoded.filter).to.equal(true);
      expect(decoded.lightPush).to.equal(true);
    });

    it("should set field with only RELAY enabled", async () => {
      waku2Protocols.relay = true;

      enr.waku2 = waku2Protocols;
      const txt = await enr.encodeTxt(keypair.privateKey);
      const decoded = (await ENR.decodeTxt(txt)).waku2!;

      expect(decoded.relay).to.equal(true);
      expect(decoded.store).to.equal(false);
      expect(decoded.filter).to.equal(false);
      expect(decoded.lightPush).to.equal(false);
    });

    it("should set field with only STORE enabled", async () => {
      waku2Protocols.store = true;

      enr.waku2 = waku2Protocols;
      const txt = await enr.encodeTxt(keypair.privateKey);
      const decoded = (await ENR.decodeTxt(txt)).waku2!;

      expect(decoded.relay).to.equal(false);
      expect(decoded.store).to.equal(true);
      expect(decoded.filter).to.equal(false);
      expect(decoded.lightPush).to.equal(false);
    });

    it("should set field with only FILTER enabled", async () => {
      waku2Protocols.filter = true;

      enr.waku2 = waku2Protocols;
      const txt = await enr.encodeTxt(keypair.privateKey);
      const decoded = (await ENR.decodeTxt(txt)).waku2!;

      expect(decoded.relay).to.equal(false);
      expect(decoded.store).to.equal(false);
      expect(decoded.filter).to.equal(true);
      expect(decoded.lightPush).to.equal(false);
    });

    it("should set field with only LIGHTPUSH enabled", async () => {
      waku2Protocols.lightPush = true;

      enr.waku2 = waku2Protocols;
      const txt = await enr.encodeTxt(keypair.privateKey);
      const decoded = (await ENR.decodeTxt(txt)).waku2!;

      expect(decoded.relay).to.equal(false);
      expect(decoded.store).to.equal(false);
      expect(decoded.filter).to.equal(false);
      expect(decoded.lightPush).to.equal(true);
    });
  });

  describe("Waku2 key: decode", () => {
    it("Relay + Store", async function () {
      const txt =
        "enr:-Iu4QADPfXNCM6iYyte0pIdbMirIw_AsKR7J1DeJBysXDWz4DZvyjgIwpMt-sXTVUzLJdE9FaStVy2ZKtHUVQAH61-KAgmlkgnY0gmlwhMCosvuJc2VjcDI1NmsxoQI0OCNtPJtBayNgvFvKp-0YyCozcvE1rqm_V1W51nHVv4N0Y3CC6mCFd2FrdTIH";

      const decoded = (await ENR.decodeTxt(txt)).waku2!;

      expect(decoded.relay).to.equal(true);
      expect(decoded.store).to.equal(true);
      expect(decoded.filter).to.equal(true);
      expect(decoded.lightPush).to.equal(false);
    });
  });
});
