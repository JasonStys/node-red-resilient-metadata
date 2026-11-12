# Security Model

## Native application boundary

The native workbench accepts data, not executable flow nodes, service endpoints or credentials. It runs the original nodes against one owned numeric-loopback provider, with no admin/editor listener or module installation API. Its renderer is sandboxed, isolated and restricted to a closed main-frame bridge and three verified static assets. Native HTTP, input/output completion, cancellation, actual provider closure and child exit are separate observations; a message or close acknowledgement alone is insufficient.

Workspace files and exported project/results are plaintext for one trusted OS account. Ordinary ancestors and fixed mutable members are checked before profile writes; imports are bounded, descriptor-bound reads and exports refuse overwrite. Same-account concurrent namespace attacks, multiuser authorization, encrypted storage, universal crash recovery and authentication of local result hashes are outside scope. Retained lock/nonce evidence is not silently reset. A fatal native exit uses explicit status 1 only before child creation or after the actual owned child has exited; normal Quit still waits and exits normally.

The original development Node-RED registry's bundled npm dependency originally hid old matching libraries from a shallow graph audit. A narrowly scoped local npm variant and glob override now retain original Node-RED 5.0.8 while removing opaque bundled leaves. The actual installed original-host and private-runtime roots are independently enumerated, their 416 original non-manifest npm files and disclosed variant manifest verified, and affected glob/minimatch versions refused alongside full locked advisory audits. See [exact source/terms and limits](native-npm-component.md). This is not a claim that package-name/version auditing proves arbitrary vendor JavaScript secure.

## Protected assets

- API token stored through Node-RED credentials.
- Flow availability under slow, failing, or high-volume upstream work.
- Integrity of metadata delivered to downstream automation.
- Logs and messages, which must not expose secrets or unbounded remote content.

## Controls

| Threat                         | Control                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Credential exposure            | Password credential field; token is private in the client; no token/body in serialized errors.                 |
| Cleartext remote transport     | HTTPS required except explicit loopback development hosts.                                                     |
| URL credential/query injection | Userinfo, query, and fragment are rejected from the base URL; path/query fields are encoded.                   |
| Resource exhaustion            | Active, waiting, timeout, retry, identifier, response-byte, and documentation-array bounds.                    |
| Malicious response             | Media-type check, bounded stream, JSON parse, strict schema, HTTPS documentation URLs, identity/version match. |
| Retry amplification            | GET only, at most two retries, fixed bounded delay, non-retriable auth/schema/not-found errors.                |
| Late work after redeploy       | Abort propagation, queue close, timer/listener cleanup, and suppression of sends after close.                  |
| Dependency regression          | Lockfile, Dependabot, CodeQL, type-aware lint, and repeatable CI.                                              |

## Trust assumptions

Node-RED administrators can read deployed runtime configuration and install modules. Node-RED's credential secret should be configured so stored credentials are encrypted at rest. TLS certificate validation uses the Node.js platform defaults. Downstream nodes must still decide whether a valid remote record is appropriate for their own control action.

## Reporting

Please do not open a public issue for a suspected vulnerability. Follow [`SECURITY.md`](../SECURITY.md) for private reporting guidance and include the affected version, reproducible conditions, and impact without real credentials.

## Package validation boundary

The package consumer test uses only synthetic credentials, an owned loopback HTTP fixture, and the actual installed TGZ. Empty private npm configuration files, disabled install scripts, a credential-filtered child environment, exact runtime dependency integrity and physical path checks reduce exposure during that test. The development host is not bundled into the two-node product: patched Node-RED/helper transport and test-tool dependencies are locked and separately audited in full. These measures do not authenticate a manually shared archive; use an independently trusted distribution channel and review its hash/evidence.
