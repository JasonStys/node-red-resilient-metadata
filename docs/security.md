# Security Model

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
