import assert from "assert";

import { debug } from "debug";

import { ENR } from "../enr";

import { DnsOverHttps, Endpoints } from "./dns_over_https";
import { ENRTree } from "./enrtree";

const dbg = debug("waku:discovery:dns");

export type SearchContext = {
  domain: string;
  publicKey: string;
  visits: { [key: string]: boolean };
};

export interface DnsClient {
  resolveTXT: (domain: string) => Promise<string[]>;
}

export interface NodeCapabilityCount {
  relay?: number;
  store?: number;
  filter?: number;
  lightpush?: number;
}

export class DnsNodeDiscovery {
  private readonly dns: DnsClient;
  private readonly _DNSTreeCache: { [key: string]: string };
  private readonly _errorTolerance: number = 10;

  public static dnsOverHttp(endpoints?: Endpoints): DnsNodeDiscovery {
    const dnsClient = new DnsOverHttps(endpoints);
    return new DnsNodeDiscovery(dnsClient);
  }

  /**
   * Returns a list of verified peers listed in an EIP-1459 DNS tree. Method may
   * return fewer peers than requested if `maxQuantity` is larger than the number
   * of ENR records or the number of errors/duplicate peers encountered by randomized
   * search exceeds `maxQuantity` plus the `errorTolerance` factor.
   * Will return peers only with certain capabilities (protocols) enabled if
   *  `wantedNodeCapabilityCount` object is passed in.
   */
  async getPeers(
    maxQuantity: number,
    enrTreeUrls: string[],
    wantedNodeCapabilityCount: NodeCapabilityCount | undefined
  ): Promise<ENR[]> {
    let totalSearches = 0;
    const peers: ENR[] = [];

    console.log("wantedNodeCapabilityCount:", wantedNodeCapabilityCount);

    console.log("enrTreeUrls:", enrTreeUrls);

    const networkIndex = Math.floor(Math.random() * enrTreeUrls.length);
    const { publicKey, domain } = ENRTree.parseTree(enrTreeUrls[networkIndex]);

    while (
      peers.length < maxQuantity &&
      totalSearches < maxQuantity + this._errorTolerance
    ) {
      const context: SearchContext = {
        domain,
        publicKey,
        visits: {},
      };

      const peer = await this._search(domain, context);

      if (peer && isNewPeer(peer, peers)) {
        console.log("peer:", peer);
        peers.push(peer);
        dbg(
          `got new peer candidate from DNS address=${peer.nodeId}@${peer.ip}`
        );
      }

      totalSearches++;
    }
    return peers;
  }

  public constructor(dns: DnsClient) {
    this._DNSTreeCache = {};
    this.dns = dns;
  }

  /**
   * Runs a recursive, randomized descent of the DNS tree to retrieve a single
   * ENR record as an ENR. Returns null if parsing or DNS resolution fails.
   */
  private async _search(
    subdomain: string,
    context: SearchContext
  ): Promise<ENR | null> {
    try {
      const entry = await this._getTXTRecord(subdomain, context);
      context.visits[subdomain] = true;

      let next: string;
      let branches: string[];

      const entryType = getEntryType(entry);
      try {
        switch (entryType) {
          case ENRTree.ROOT_PREFIX:
            next = ENRTree.parseAndVerifyRoot(entry, context.publicKey);
            return await this._search(next, context);
          case ENRTree.BRANCH_PREFIX:
            branches = ENRTree.parseBranch(entry);
            next = selectRandomPath(branches, context);
            return await this._search(next, context);
          case ENRTree.RECORD_PREFIX:
            return ENR.decodeTxt(entry);
          default:
            return null;
        }
      } catch (error) {
        dbg(
          `Failed to search DNS tree ${entryType} at subdomain ${subdomain}: ${error}`
        );
        return null;
      }
    } catch (error) {
      dbg(`Failed to retrieve TXT record at subdomain ${subdomain}: ${error}`);
      return null;
    }
  }

  /**
   * Retrieves the TXT record stored at a location from either
   * this DNS tree cache or via DNS query.
   *
   * @throws if the TXT Record contains non-UTF-8 values.
   */
  private async _getTXTRecord(
    subdomain: string,
    context: SearchContext
  ): Promise<string> {
    if (this._DNSTreeCache[subdomain]) {
      return this._DNSTreeCache[subdomain];
    }

    // Location is either the top level tree entry host or a subdomain of it.
    const location =
      subdomain !== context.domain
        ? `${subdomain}.${context.domain}`
        : context.domain;

    const response = await this.dns.resolveTXT(location);

    assert(
      response.length,
      "Received empty result array while fetching TXT record"
    );
    assert(response[0].length, "Received empty TXT record");

    // Branch entries can be an array of strings of comma delimited subdomains, with
    // some subdomain strings split across the array elements
    const result = response.join("");

    this._DNSTreeCache[subdomain] = result;
    return result;
  }
}

function getEntryType(entry: string): string {
  if (entry.startsWith(ENRTree.ROOT_PREFIX)) return ENRTree.ROOT_PREFIX;
  if (entry.startsWith(ENRTree.BRANCH_PREFIX)) return ENRTree.BRANCH_PREFIX;
  if (entry.startsWith(ENRTree.RECORD_PREFIX)) return ENRTree.RECORD_PREFIX;

  return "";
}

/**
 * Returns a randomly selected subdomain string from the list provided by a branch
 * entry record.
 *
 * The client must track subdomains which are already resolved to avoid
 * going into an infinite loop b/c branch entries can contain
 * circular references. It’s in the client’s best interest to traverse the
 * tree in random order.
 */
function selectRandomPath(branches: string[], context: SearchContext): string {
  // Identify domains already visited in this traversal of the DNS tree.
  // Then filter against them to prevent cycles.
  const circularRefs: { [key: number]: boolean } = {};
  for (const [idx, subdomain] of branches.entries()) {
    if (context.visits[subdomain]) {
      circularRefs[idx] = true;
    }
  }
  // If all possible paths are circular...
  if (Object.keys(circularRefs).length === branches.length) {
    throw new Error("Unresolvable circular path detected");
  }

  // Randomly select a viable path
  let index;
  do {
    index = Math.floor(Math.random() * branches.length);
  } while (circularRefs[index]);

  return branches[index];
}

/**
 * @returns false if candidate peer already exists in the
 *         current collection of peers based on the node id value;
 *         true otherwise.
 */
function isNewPeer(peer: ENR | null, peers: ENR[]): boolean {
  if (!peer || !peer.nodeId) return false;

  for (const existingPeer of peers) {
    if (peer.nodeId === existingPeer.nodeId) {
      return false;
    }
  }

  return true;
}
