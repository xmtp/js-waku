import debug from "debug";
import { Multiaddr } from "multiaddr";

import { DnsNodeDiscovery, NodeCapabilityCount } from "./dns";

import { getPredefinedBootstrapNodes, getPseudoRandomSubset } from "./index";

const dbg = debug("waku:discovery:bootstrap");

/**
 * Setup discovery method used to bootstrap.
 *
 * Only one method is used. `default`, `peers`, `getPeers` and `enr` options are mutually exclusive.
 */
export interface BootstrapOptions {
  /**
   * The maximum of peers to connect to as part of the bootstrap process.
   *
   * @default [[Bootstrap.DefaultMaxPeers]]
   */
  maxPeers?: number;
  /**
   * Use the default discovery method. Overrides all other options but `maxPeers`
   *
   * The default discovery method is likely to change overtime as new discovery
   * methods are implemented.
   *
   * @default false
   */
  default?: boolean;
  /**
   * Multiaddrs of peers to connect to.
   */
  peers?: string[] | Multiaddr[];
  /**
   * Getter that retrieve multiaddrs of peers to connect to.
   */
  getPeers?: () => Promise<string[] | Multiaddr[]>;
  /**
   * An EIP-1459 ENR Tree URL. For example:
   * "enrtree://AOFTICU2XWDULNLZGRMQS4RIZPAZEHYMV4FYHAPW563HNRAOERP7C@test.nodes.vac.dev"
   */
  enrUrl?: string;
  /**
   * An object that contains the type of capability (protocol) and
   * the number of nodes that have that capability (protocol) enabled.
   */
  wantedNodeCapabilityCount?: NodeCapabilityCount;
}

/**
 * Parse options and expose function to return bootstrap peer addresses.
 */
export class Bootstrap {
  public static DefaultMaxPeers = 1;

  public readonly getBootstrapPeers: (() => Promise<Multiaddr[]>) | undefined;

  constructor(opts: BootstrapOptions) {
    const maxPeers = opts.maxPeers ?? Bootstrap.DefaultMaxPeers;

    if (opts.default) {
      dbg("Use hosted list of peers.");

      this.getBootstrapPeers = (): Promise<Multiaddr[]> => {
        return Promise.resolve(
          getPredefinedBootstrapNodes(undefined, maxPeers)
        );
      };
    } else if (opts.peers !== undefined && opts.peers.length > 0) {
      const allPeers: Multiaddr[] = opts.peers.map(
        (node: string | Multiaddr) => {
          if (typeof node === "string") {
            return new Multiaddr(node);
          } else {
            return node;
          }
        }
      );
      const peers = getPseudoRandomSubset(allPeers, maxPeers);
      dbg(
        "Use provided list of peers (reduced to maxPeers)",
        allPeers.map((ma) => ma.toString())
      );
      this.getBootstrapPeers = (): Promise<Multiaddr[]> =>
        Promise.resolve(peers);
    } else if (typeof opts.getPeers === "function") {
      dbg("Bootstrap: Use provided getPeers function.");
      const getPeers = opts.getPeers;

      this.getBootstrapPeers = async (): Promise<Multiaddr[]> => {
        const allPeers = await getPeers();
        return getPseudoRandomSubset<string | Multiaddr>(
          allPeers,
          maxPeers
        ).map((node) => new Multiaddr(node));
      };
    } else if (opts.enrUrl) {
      const enrUrl = opts.enrUrl;
      dbg("Use provided EIP-1459 ENR Tree URL.");

      const dns = DnsNodeDiscovery.dnsOverHttp();

      this.getBootstrapPeers = async (): Promise<Multiaddr[]> => {
        const enrs = await dns.getPeers(
          maxPeers,
          [enrUrl],
          opts.wantedNodeCapabilityCount
        );
        dbg(`Found ${enrs.length} peers`);
        return enrs.map((enr) => enr.getFullMultiaddrs()).flat();
      };
    } else {
      dbg("No bootstrap method specified, no peer will be returned");
      this.getBootstrapPeers = undefined;
    }
  }
}
