"""Jason Stys: real patched npm CLI compatibility using fresh inert offline packages.

Runs genuine upstream CLI/core with the selected real Node runtime. Independently
specified file lists, original bytes, lifecycle sentinels, dependency inspection,
negative-install preservation and a network tripwire prevent a mocked success.
Normal user configuration, caches, credentials and global installs are excluded.

Declarations, parameters and bindings: generated docs/code-map.md (pnpm code-map).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "native-installer/source"


def require(condition, message):
    """Keep real-command assertions effective under optimized Python."""
    if not condition:
        raise ValueError(message)


def write(file, text):
    """Create only a new controlled fixture member; never replace existing evidence."""
    file.parent.mkdir(parents=True, exist_ok=True)
    with file.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(text)


def main():
    """Exercise actual CLI and patched matching libraries; preserve all failed output."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument(
        "--component", choices=("source", "development", "native"), default="source"
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    node, output = args.node.absolute(), args.output.absolute()
    require(
        node.is_file() and not node.is_symlink(),
        "A real selected Node executable is required",
    )
    require(
        output.is_relative_to(ROOT / "artifacts/native-tooling")
        and not output.exists(),
        "Use a fresh repository-owned proof output",
    )
    output.mkdir(parents=True)
    home = output / "isolated-home"
    for directory in (home, home / "Local", home / "Roaming", home / "Temp"):
        directory.mkdir(exist_ok=True)
    for name in ("user.npmrc", "global.npmrc"):
        write(home / name, "")
    environment = {
        key: value
        for key, value in os.environ.items()
        if key.upper() in {"SYSTEMROOT", "WINDIR", "SYSTEMDRIVE", "COMSPEC"}
    }
    environment.update(
        PATH=str(node.parent)
        + os.pathsep
        + ("C:/Windows/System32" if os.name == "nt" else "/usr/bin:/bin"),
        USERPROFILE=str(home),
        HOME=str(home),
        LOCALAPPDATA=str(home / "Local"),
        APPDATA=str(home / "Roaming"),
        TEMP=str(home / "Temp"),
        TMP=str(home / "Temp"),
        ELECTRON_RUN_AS_NODE="1",
        NPM_CONFIG_USERCONFIG=str(home / "user.npmrc"),
        NPM_CONFIG_GLOBALCONFIG=str(home / "global.npmrc"),
        NPM_CONFIG_CACHE=str(home / "fresh-cache"),
        NPM_CONFIG_OFFLINE="true",
        NPM_CONFIG_UPDATE_NOTIFIER="false",
        NO_UPDATE_NOTIFIER="1",
    )
    requests = []

    class Tripwire(BaseHTTPRequestHandler):
        """An actual loopback listener proves offline commands did not request registry data."""

        def do_GET(self):
            """Do get."""
            requests.append(self.path)
            self.send_response(503)
            self.send_header("Content-Length", "0")
            self.end_headers()

        do_POST = do_GET

        def log_message(self, *_args):
            """Log message."""
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Tripwire)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    environment["NPM_CONFIG_REGISTRY"] = "http://127.0.0.1:" + str(server.server_port)
    component = {
        "source": SOURCE,
        "development": ROOT / "node_modules/npm",
        "native": ROOT / "native-runtime/node_modules/npm",
    }[args.component]
    cli = component / "bin/npm-cli.js"
    commands, passed, checks = [], False, []

    def command(arguments, cwd, success=True):
        """Run a literal real argv with finite time; error text never becomes passing evidence."""
        number = len(commands) + 1
        result = subprocess.run(
            [str(node), *arguments],
            cwd=cwd,
            env=environment,
            capture_output=True,
            timeout=90,
        )
        (output / f"command-{number}-stdout.log").write_bytes(result.stdout)
        (output / f"command-{number}-stderr.log").write_bytes(result.stderr)
        commands.append({"command": arguments, "exitCode": result.returncode})
        require(
            (result.returncode == 0) if success else result.returncode != 0,
            "Actual CLI exit did not match this fixture's required outcome",
        )
        return result.stdout.decode("utf-8")

    def npm(arguments, cwd, success=True):
        """Npm."""
        return command([str(cli), *arguments], cwd, success)

    try:
        version = command(["-p", "process.versions.node"], output).strip()
        require(
            npm(["--version"], output).strip() == "12.2.2+workbench.1",
            "Wrong actual npm CLI variant",
        )
        checks.append("actual upstream variant CLI identity")
        package = output / "package-input"
        package.mkdir()
        script = "node -e \"require('node:fs').writeFileSync('LIFECYCLE-MUST-NOT-RUN','bad')\""
        manifest = {
            "name": "metadata-offline-component-fixture",
            "version": "1.0.0",
            "main": "lib/index.js",
            "files": ["lib", "schema"],
            "scripts": {"prepack": script, "postpack": script, "postinstall": script},
        }
        write(package / "package.json", json.dumps(manifest, indent=2) + "\n")
        inputs = {
            "lib/index.js": "module.exports = input => input.trim().toUpperCase();\n",
            "lib/internal/helper.js": "module.exports = {schema: 1};\n",
            "lib/.npmignore": "*.tmp\n",
            "lib/scratch.tmp": "excluded synthetic scratch\n",
            "schema/product.json": '{"type":"object"}\n',
            "README.md": "# Owned synthetic package\n",
            "LICENSE": "Owned synthetic fixture by Jason Stys.\n",
            "private-note.txt": "excluded non-secret synthetic note\n",
        }
        for name, text in inputs.items():
            write(package / name, text)
        expected = {
            "package.json",
            "README.md",
            "LICENSE",
            "lib/index.js",
            "lib/internal/helper.js",
            "schema/product.json",
        }
        dry = json.loads(
            npm(
                ["pack", "--dry-run", "--json", "--offline", "--ignore-scripts"],
                package,
            )
        )
        require(
            set(dry) == {manifest["name"]}
            and {item["path"] for item in dry[manifest["name"]]["files"]} == expected,
            "Actual npm pack selection differs from independently specified expected files",
        )
        require(
            not (package / "LIFECYCLE-MUST-NOT-RUN").exists(),
            "A lifecycle script ran during dry-run",
        )
        checks.append("actual packlist exact files, nested ignore and no lifecycle")
        packed = output / "packages"
        packed.mkdir()
        result = json.loads(
            npm(
                [
                    "pack",
                    "--json",
                    "--offline",
                    "--ignore-scripts",
                    "--pack-destination",
                    str(packed),
                ],
                package,
            )
        )
        require(
            set(result) == {manifest["name"]}
            and {item["path"] for item in result[manifest["name"]]["files"]}
            == expected,
            "Actual packed selection differs",
        )
        archive = packed / result[manifest["name"]]["filename"]
        require(archive.is_file(), "Actual npm archive was not written")
        require(
            not (package / "LIFECYCLE-MUST-NOT-RUN").exists(),
            "A lifecycle script ran during pack",
        )
        checks.append("genuine offline archive production")
        consumer = output / "consumer"
        consumer.mkdir()
        write(
            consumer / "package.json",
            '{"name":"metadata-offline-consumer","version":"1.0.0","private":true}\n',
        )
        npm(
            [
                "install",
                str(archive),
                "--offline",
                "--ignore-scripts",
                "--no-audit",
                "--no-fund",
                "--package-lock=true",
                "--prefix",
                str(consumer),
            ],
            consumer,
        )
        installed = consumer / "node_modules/metadata-offline-component-fixture"
        require(
            not (installed / "LIFECYCLE-MUST-NOT-RUN").exists(),
            "A lifecycle script ran during install",
        )
        for name in expected - {"package.json"}:
            require(
                (installed / name).read_bytes() == (package / name).read_bytes(),
                "Installed original package bytes differ",
            )
        listing = json.loads(
            npm(
                ["ls", "--json", "--all", "--offline", "--prefix", str(consumer)],
                consumer,
            )
        )
        require(
            set(listing["dependencies"]) == {manifest["name"]}
            and listing["dependencies"][manifest["name"]]["version"] == "1.0.0"
            and not listing.get("problems"),
            "Actual installed dependency tree differs",
        )
        value = command(
            [
                "-e",
                "console.log(require(process.argv[1])('  metadata  '))",
                str(installed),
            ],
            consumer,
        ).strip()
        require(
            value == "METADATA",
            "The genuinely installed fixture module did not execute",
        )
        checks.append(
            "genuine offline installation, exact bytes, tree and executable module"
        )
        before = {
            name: (consumer / name).read_bytes()
            for name in ("package.json", "package-lock.json")
        }
        negative = json.loads(
            npm(
                [
                    "install",
                    "workbench-uncached-negative-fixture",
                    "--offline",
                    "--ignore-scripts",
                    "--no-audit",
                    "--no-fund",
                    "--json",
                    "--prefix",
                    str(consumer),
                ],
                consumer,
                success=False,
            )
        )
        require(
            negative.get("error", {}).get("code") == "ENOTCACHED",
            "Missing offline package must fail through actual cache refusal",
        )
        require(
            all(
                (consumer / name).read_bytes() == content
                for name, content in before.items()
            ),
            "Failed offline install changed the accepted consumer",
        )
        checks.append("real uncached error preserves prior manifest and lock")
        glob_program = "const path=require('node:path');const r=require('node:module').createRequire(path.join(process.argv[1],'package.json'));const g=r('glob');const m=r('minimatch');console.log(JSON.stringify({files:g.globSync('**/*.{js,json}',{cwd:process.argv[2],ignore:['**/node_modules/**'],posix:true}).sort(),accept:m.minimatch('lib/internal/helper.js','lib/**/{helper,index}.js'),deny:m.minimatch('private-note.txt','lib/**')}))"
        matching = json.loads(
            command(["-e", glob_program, str(component), str(package)], package)
        )
        require(
            matching
            == {
                "files": [
                    "lib/index.js",
                    "lib/internal/helper.js",
                    "package.json",
                    "schema/product.json",
                ],
                "accept": True,
                "deny": False,
            },
            "Actual patched glob/minimatch behavior differs",
        )
        checks.append(
            "patched matching libraries execute real nested/brace and refusal cases"
        )
        require(not requests, "An offline command attempted registry access")
        checks.append("actual network tripwire stayed unused")
        passed = True
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        proof = {
            "passed": passed,
            "actualNode": locals().get("version"),
            "actualNpm": "12.2.2+workbench.1",
            "componentContext": args.component,
            "checks": checks,
            "commands": commands,
            "registryRequests": len(requests),
            "networkTripwireStopped": not thread.is_alive(),
            "normalUserConfigurationRead": False,
            "globalInstallation": False,
            "fixtureScope": "Fresh owned synthetic package and consumer; no fetch mock, output fabrication, real user data or outside provider.",
        }
        write(output / "proof.json", json.dumps(proof, indent=2) + "\n")
    print(
        json.dumps(
            {
                "passed": passed,
                "checks": len(checks),
                "actualNode": version,
                "registryRequests": len(requests),
            }
        )
    )


if __name__ == "__main__":
    main()
