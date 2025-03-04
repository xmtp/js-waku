import { Noise } from "@chainsafe/libp2p-noise";
import debug from "debug";
import Libp2p, { Connection, Libp2pModules, Libp2pOptions } from "libp2p";
import Libp2pBootstrap from "libp2p-bootstrap";
import { MuxedStream } from "libp2p-interfaces/dist/src/stream-muxer/types";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: No types available
import Mplex from "libp2p-mplex";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: No types available
import Websockets from "libp2p-websockets";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: No types available
import filters from "libp2p-websockets/src/filters";
import PingService from "libp2p/src/ping";
import { Multiaddr, multiaddr } from "multiaddr";
import PeerId from "peer-id";

import { Bootstrap, BootstrapOptions } from "./discovery";
import { FilterCodec, WakuFilter } from "./waku_filter";
import { LightPushCodec, WakuLightPush } from "./waku_light_push";
import { DecryptionMethod, WakuMessage } from "./waku_message";
import { WakuRelay } from "./waku_relay";
import { RelayCodecs, RelayPingContentTopic } from "./waku_relay/constants";
import { StoreCodecs, WakuStore } from "./waku_store";

const websocketsTransportKey = Websockets.prototype[Symbol.toStringTag];

export const DefaultPingKeepAliveValueSecs = 0;
export const DefaultRelayKeepAliveValueSecs = 5 * 60;

const dbg = debug("waku:waku");

export enum Protocols {
  Relay = "relay",
  Store = "store",
  LightPush = "lightpush",
  Filter = "filter",
}

export interface CreateOptions {
  /**
   * The PubSub Topic to use. Defaults to {@link DefaultPubSubTopic}.
   *
   * One and only one pubsub topic is used by Waku. This is used by:
   * - WakuRelay to receive, route and send messages,
   * - WakuLightPush to send messages,
   * - WakuStore to retrieve messages.
   *
   * The usage of the default pubsub topic is recommended.
   * See [Waku v2 Topic Usage Recommendations](https://rfc.vac.dev/spec/23/) for details.
   *
   * @default {@link DefaultPubSubTopic}
   */
  pubSubTopic?: string;
  /**
   * Set keep alive frequency in seconds: Waku will send a `/ipfs/ping/1.0.0`
   * request to each peer after the set number of seconds. Set to 0 to disable.
   *
   * @default {@link DefaultPingKeepAliveValueSecs}
   */
  pingKeepAlive?: number;
  /**
   * Set keep alive frequency in seconds: Waku will send a ping message over
   * relay to each peer after the set number of seconds. Set to 0 to disable.
   *
   * @default {@link DefaultRelayKeepAliveValueSecs}
   */
  relayKeepAlive?: number;
  /**
   * You can pass options to the `Libp2p` instance used by {@link Waku} using the {@link CreateOptions.libp2p} property.
   * This property is the same type than the one passed to [`Libp2p.create`](https://github.com/libp2p/js-libp2p/blob/master/doc/API.md#create)
   * apart that we made the `modules` property optional and partial,
   * allowing its omission and letting Waku set good defaults.
   * Notes that some values are overridden by {@link Waku} to ensure it implements the Waku protocol.
   */
  libp2p?: Omit<Libp2pOptions & import("libp2p").CreateOptions, "modules"> & {
    modules?: Partial<Libp2pModules>;
  };
  /**
   * Byte array used as key for the noise protocol used for connection encryption
   * by [`Libp2p.create`](https://github.com/libp2p/js-libp2p/blob/master/doc/API.md#create)
   * This is only used for test purposes to not run out of entropy during CI runs.
   */
  staticNoiseKey?: Uint8Array;
  /**
   * Use libp2p-bootstrap to discover and connect to new nodes.
   *
   * See [[BootstrapOptions]] for available parameters.
   *
   * Note: It overrides any other peerDiscovery modules that may have been set via
   * {@link CreateOptions.libp2p}.
   */
  bootstrap?: BootstrapOptions;
  decryptionKeys?: Array<Uint8Array | string>;
}

export class Waku {
  public libp2p: Libp2p;
  public relay: WakuRelay;
  public store: WakuStore;
  public filter: WakuFilter;
  public lightPush: WakuLightPush;

  private pingKeepAliveTimers: {
    [peer: string]: ReturnType<typeof setInterval>;
  };
  private relayKeepAliveTimers: {
    [peer: string]: ReturnType<typeof setInterval>;
  };

  private constructor(
    options: CreateOptions,
    libp2p: Libp2p,
    store: WakuStore,
    lightPush: WakuLightPush,
    filter: WakuFilter
  ) {
    this.libp2p = libp2p;
    this.relay = libp2p.pubsub as unknown as WakuRelay;
    this.store = store;
    this.filter = filter;
    this.lightPush = lightPush;
    this.pingKeepAliveTimers = {};
    this.relayKeepAliveTimers = {};

    const pingKeepAlive =
      options.pingKeepAlive || DefaultPingKeepAliveValueSecs;
    const relayKeepAlive =
      options.relayKeepAlive || DefaultRelayKeepAliveValueSecs;

    libp2p.connectionManager.on("peer:connect", (connection: Connection) => {
      this.startKeepAlive(connection.remotePeer, pingKeepAlive, relayKeepAlive);
    });

    /**
     * NOTE: Event is not being emitted on closing nor losing a connection.
     * @see https://github.com/libp2p/js-libp2p/issues/939
     * @see https://github.com/status-im/js-waku/issues/252
     *
     * >This event will be triggered anytime we are disconnected from another peer,
     * >regardless of the circumstances of that disconnection.
     * >If we happen to have multiple connections to a peer,
     * >this event will **only** be triggered when the last connection is closed.
     * @see https://github.com/libp2p/js-libp2p/blob/bad9e8c0ff58d60a78314077720c82ae331cc55b/doc/API.md?plain=1#L2100
     */
    libp2p.connectionManager.on("peer:disconnect", (connection: Connection) => {
      this.stopKeepAlive(connection.remotePeer);
    });

    options?.decryptionKeys?.forEach((key) => {
      this.addDecryptionKey(key);
    });
  }

  /**
   * Create and start new waku node.
   */
  static async create(options?: CreateOptions): Promise<Waku> {
    // Get an object in case options or libp2p are undefined
    const libp2pOpts = Object.assign({}, options?.libp2p);

    // Default for Websocket filter is `all`:
    // Returns all TCP and DNS based addresses, both with ws or wss.
    libp2pOpts.config = Object.assign(
      {
        transport: {
          [websocketsTransportKey]: {
            filter: filters.all,
          },
        },
      },
      options?.libp2p?.config
    );

    // Pass pubsub topic to relay
    if (options?.pubSubTopic) {
      libp2pOpts.config.pubsub = Object.assign(
        { pubSubTopic: options.pubSubTopic },
        libp2pOpts.config.pubsub
      );
    }

    libp2pOpts.modules = Object.assign({}, options?.libp2p?.modules);

    // Default transport for libp2p is Websockets
    libp2pOpts.modules = Object.assign(
      {
        transport: [Websockets],
      },
      options?.libp2p?.modules
    );

    // streamMuxer, connection encryption and pubsub are overridden
    // as those are the only ones currently supported by Waku nodes.
    libp2pOpts.modules = Object.assign(libp2pOpts.modules, {
      streamMuxer: [Mplex],
      connEncryption: [new Noise(options?.staticNoiseKey)],
      pubsub: WakuRelay,
    });

    if (options?.bootstrap) {
      const bootstrap = new Bootstrap(options?.bootstrap);

      if (bootstrap.getBootstrapPeers !== undefined) {
        try {
          const list = await bootstrap.getBootstrapPeers();

          // Note: this overrides any other peer discover
          libp2pOpts.modules = Object.assign(libp2pOpts.modules, {
            peerDiscovery: [Libp2pBootstrap],
          });

          libp2pOpts.config.peerDiscovery = {
            [Libp2pBootstrap.tag]: {
              list,
              enabled: true,
            },
          };
        } catch (e) {
          dbg("Failed to retrieve bootstrap nodes", e);
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: modules property is correctly set thanks to voodoo
    const libp2p = await Libp2p.create(libp2pOpts);

    const wakuStore = new WakuStore(libp2p, {
      pubSubTopic: options?.pubSubTopic,
    });
    const wakuLightPush = new WakuLightPush(libp2p);
    const wakuFilter = new WakuFilter(libp2p);

    await libp2p.start();

    return new Waku(
      options ? options : {},
      libp2p,
      wakuStore,
      wakuLightPush,
      wakuFilter
    );
  }

  /**
   * Dials to the provided peer.
   *
   * @param peer The peer to dial
   * @param protocols Waku protocols we expect from the peer; Default to Relay
   */
  async dial(
    peer: PeerId | Multiaddr | string,
    protocols?: Protocols[]
  ): Promise<{
    stream: MuxedStream;
    protocol: string;
  }> {
    const _protocols = protocols ?? [Protocols.Relay];

    const codecs: string[] = [];
    if (_protocols.includes(Protocols.Relay)) {
      RelayCodecs.forEach((codec) => codecs.push(codec));
    }
    if (_protocols.includes(Protocols.Store)) {
      for (const codec of Object.values(StoreCodecs)) {
        codecs.push(codec);
      }
    }
    if (_protocols.includes(Protocols.LightPush)) {
      codecs.push(LightPushCodec);
    }
    if (_protocols.includes(Protocols.Filter)) {
      codecs.push(FilterCodec);
    }

    return this.libp2p.dialProtocol(peer, codecs);
  }

  /**
   * Add peer to address book, it will be auto-dialed in the background.
   */
  addPeerToAddressBook(
    peerId: PeerId | string,
    multiaddrs: Multiaddr[] | string[]
  ): void {
    let peer;
    if (typeof peerId === "string") {
      peer = PeerId.createFromB58String(peerId);
    } else {
      peer = peerId;
    }
    const addresses = multiaddrs.map((addr: Multiaddr | string) => {
      if (typeof addr === "string") {
        return multiaddr(addr);
      } else {
        return addr;
      }
    });
    this.libp2p.peerStore.addressBook.set(peer, addresses);
  }

  async stop(): Promise<void> {
    this.stopAllKeepAlives();
    await this.libp2p.stop();
  }

  /**
   * Register a decryption key to attempt decryption of messages received via
   * [[WakuRelay]] and [[WakuStore]]. This can either be a private key for
   * asymmetric encryption or a symmetric key.
   *
   * Strings must be in hex format.
   */
  addDecryptionKey(
    key: Uint8Array | string,
    options?: { method?: DecryptionMethod; contentTopics?: string[] }
  ): void {
    this.relay.addDecryptionKey(key, options);
    this.store.addDecryptionKey(key, options);
    this.filter.addDecryptionKey(key, options);
  }

  /**
   * Delete a decryption key that was used to attempt decryption of messages
   * received via [[WakuRelay]] or [[WakuStore]].
   *
   * Strings must be in hex format.
   */
  deleteDecryptionKey(key: Uint8Array | string): void {
    this.relay.deleteDecryptionKey(key);
    this.store.deleteDecryptionKey(key);
    this.filter.deleteDecryptionKey(key);
  }

  /**
   * Return the local multiaddr with peer id on which libp2p is listening.
   *
   * @throws if libp2p is not listening on localhost.
   */
  getLocalMultiaddrWithID(): string {
    const localMultiaddr = this.libp2p.multiaddrs.find((addr) =>
      addr.toString().match(/127\.0\.0\.1/)
    );
    if (!localMultiaddr || localMultiaddr.toString() === "") {
      throw "Not listening on localhost";
    }
    return localMultiaddr + "/p2p/" + this.libp2p.peerId.toB58String();
  }

  /**
   * Wait for a remote peer to be ready given the passed protocols.
   * Useful when using the [[CreateOptions.bootstrap]] with [[Waku.create]].
   *
   * @param protocols The protocols that need to be enabled by remote peers.
   * @param timeoutMs A timeout value in milliseconds..
   *
   * @returns A promise that **resolves** if all desired protocols are fulfilled by
   * remote nodes, **rejects** if the timeoutMs is reached.
   *
   * @default Remote peer must have Waku Relay enabled and no time out is applied.
   */
  async waitForRemotePeer(
    protocols?: Protocols[],
    timeoutMs?: number
  ): Promise<void> {
    protocols = protocols ?? [Protocols.Relay];

    const promises: Promise<void>[] = [];

    if (protocols.includes(Protocols.Relay)) {
      const peers = this.relay.getPeers();

      if (peers.size == 0) {
        // No peer yet available, wait for a subscription
        const promise = new Promise<void>((resolve) => {
          this.libp2p.pubsub.once("pubsub:subscription-change", () => {
            // Remote peer subscribed to topic, now wait for a heartbeat
            // so that the mesh is updated and the remote peer added to it
            this.libp2p.pubsub.once("gossipsub:heartbeat", resolve);
          });
        });
        promises.push(promise);
      }
    }

    if (protocols.includes(Protocols.Store)) {
      const storePromise = (async (): Promise<void> => {
        for await (const peer of this.store.peers) {
          dbg("Store peer found", peer.id.toB58String());
          break;
        }
      })();
      promises.push(storePromise);
    }

    if (protocols.includes(Protocols.LightPush)) {
      const lightPushPromise = (async (): Promise<void> => {
        for await (const peer of this.lightPush.peers) {
          dbg("Light Push peer found", peer.id.toB58String());
          break;
        }
      })();
      promises.push(lightPushPromise);
    }

    if (protocols.includes(Protocols.Filter)) {
      const filterPromise = (async (): Promise<void> => {
        for await (const peer of this.filter.peers) {
          dbg("Filter peer found", peer.id.toB58String());
          break;
        }
      })();
      promises.push(filterPromise);
    }

    if (timeoutMs) {
      await rejectOnTimeout(
        Promise.all(promises),
        timeoutMs,
        "Timed out waiting for a remote peer."
      );
    } else {
      await Promise.all(promises);
    }
  }

  private startKeepAlive(
    peerId: PeerId,
    pingPeriodSecs: number,
    relayPeriodSecs: number
  ): void {
    // Just in case a timer already exist for this peer
    this.stopKeepAlive(peerId);

    const peerIdStr = peerId.toB58String();

    if (pingPeriodSecs !== 0) {
      const pingService = new PingService(this.libp2p);
      this.pingKeepAliveTimers[peerIdStr] = setInterval(() => {
        pingService.ping(peerId).catch((e) => {
          dbg(`Ping failed (${peerIdStr})`, e);
        });
      }, pingPeriodSecs * 1000);
    }

    if (relayPeriodSecs !== 0) {
      this.relayKeepAliveTimers[peerIdStr] = setInterval(() => {
        WakuMessage.fromBytes(new Uint8Array(), RelayPingContentTopic).then(
          (wakuMsg) => this.relay.send(wakuMsg)
        );
      }, relayPeriodSecs * 1000);
    }
  }

  private stopKeepAlive(peerId: PeerId): void {
    const peerIdStr = peerId.toB58String();

    if (this.pingKeepAliveTimers[peerIdStr]) {
      clearInterval(this.pingKeepAliveTimers[peerIdStr]);
      delete this.pingKeepAliveTimers[peerIdStr];
    }

    if (this.relayKeepAliveTimers[peerIdStr]) {
      clearInterval(this.relayKeepAliveTimers[peerIdStr]);
      delete this.relayKeepAliveTimers[peerIdStr];
    }
  }

  private stopAllKeepAlives(): void {
    for (const timer of [
      ...Object.values(this.pingKeepAliveTimers),
      ...Object.values(this.relayKeepAliveTimers),
    ]) {
      clearInterval(timer);
    }

    this.pingKeepAliveTimers = {};
    this.relayKeepAliveTimers = {};
  }
}

const awaitTimeout = (ms: number, rejectReason: string): Promise<void> =>
  new Promise((_resolve, reject) => setTimeout(() => reject(rejectReason), ms));

const rejectOnTimeout = (
  promise: Promise<any>,
  timeoutMs: number,
  rejectReason: string
): Promise<void> =>
  Promise.race([promise, awaitTimeout(timeoutMs, rejectReason)]);
