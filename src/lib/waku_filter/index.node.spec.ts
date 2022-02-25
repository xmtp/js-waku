import { expect } from "chai";
import debug from "debug";

import { makeLogFileName, NimWaku, NOISE_KEY_1 } from "../../test_utils";
import { Protocols, Waku } from "../waku";
import { WakuMessage } from "../waku_message";

const log = debug("waku:test:filter");
const TestContentTopic = "/test/1/waku-filter/utf8";

describe.only("Waku Filter [node only]", () => {
  let waku: Waku;
  let nimWaku: NimWaku;

  afterEach(async function () {
    !!nimWaku && nimWaku.stop();
    !!waku && waku.stop().catch((e) => console.log("Waku failed to stop", e));
  });

  // let waku1: Waku;
  // let waku2: Waku;

  // beforeEach(async function () {
  //   this.timeout(10000);

  //   log("Starting JS Waku instances");
  //   [waku1, waku2] = await Promise.all([
  //     Waku.create({ staticNoiseKey: NOISE_KEY_1 }),
  //     Waku.create({
  //       staticNoiseKey: NOISE_KEY_2,
  //       libp2p: { addresses: { listen: ["/ip4/0.0.0.0/tcp/0/ws"] } },
  //     }),
  //   ]);
  //   log("Instances started, adding waku2 to waku1's address book");
  //   waku1.addPeerToAddressBook(waku2.libp2p.peerId, waku2.libp2p.multiaddrs);

  //   log("Wait for mutual pubsub subscription");
  //   await Promise.all([
  //     waku1.waitForRemotePeer([Protocols.Filter]),
  //     waku2.waitForRemotePeer([Protocols.Filter]),
  //   ]);
  //   log("before each hook done");
  // });

  // afterEach(function () {
  //   if (this.currentTest?.state === "failed") {
  //     console.log(`Test failed, log file name is ${makeLogFileName(this)}`);
  //   }
  // });



  // this will probably end up getting removed but it's a good first test
  // or extracted to waku.node.spec.ts?
  it.only("should receive message when subscribed to contentTopic", async function () {
    this.timeout(10_000);

    log("Starting NimWaku instance");
    nimWaku = new NimWaku(makeLogFileName(this));
    await nimWaku.start({ filter: true });

    log("Starting JS Waku instance");
    waku = await Waku.create({
      staticNoiseKey: NOISE_KEY_1,
    });
    log("Dialing...");
    await waku.dial(await nimWaku.getMultiaddrWithId());
    log("Waiting for remote peers with protocol filter enabled");
    await waku.waitForRemotePeer([Protocols.Filter]);

    const MessageText = "Only for those subscribed to filtered content topic";
    const Message = await WakuMessage.fromUtf8String(
      MessageText,
      TestContentTopic
    );

    const MessagePush = [Message];

    const FilterRPC = {
      requestId: 1,
      messagePush: MessagePush,
    };

    waku.

    expect(waku).to.be.a("string");
  });

  // probably already tested and solved
  it("should be able to subscribe to a topic", async function () {
    
  });
  
  // this is more the functionality we want to see for Filter
  // but probably already tested and solved
  context("Single topic", function () {
    it("should receive messages from subscribed topic", async function () {});
  });
  
  // is this possible? seems to suggest so in Security Considerations
  // https://rfc.vac.dev/spec/12/#security-consideration
  context("Mutiple topics", function () {
    it("should receive messages from all subscribed topics", async function () {});
  });
  
  // probably already tested and solved
  it("should be able to unsubscribe from topic", async function () {});
});
