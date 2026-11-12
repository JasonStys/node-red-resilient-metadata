"""Actual cold subprocess CLI and reviewed single-command workflow regressions.

The copied helper runs unchanged in an inert miniature repository; real local
TAR bytes and pins exercise --archive, then --package, then --verify without any
network, package-manager execution or previously prepared source. Declarations
and line locations are generated in docs/code-map.md.
"""

import hashlib
import importlib.util
import io
import json
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HELPER = ROOT / "scripts/prepare-npm-component.py"
SPEC = importlib.util.spec_from_file_location("prepare_cli_contract", HELPER)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def cold_repository(root):
    """Create ordinary synthetic contract/archive files; never execute upstream code."""
    scripts, component = root / "scripts", root / "native-installer"
    scripts.mkdir()
    component.mkdir()
    shutil.copyfile(HELPER, scripts / HELPER.name)
    original = MODULE.encoded({"name": "npm", "version": "12.2.2", "dependencies": {}})
    core = {
        "package.json": original,
        "LICENSE": b"inert test terms",
        "README.md": b"inert readme",
        "bin/npm-cli.js": b"// inert CLI source, never executed",
        "index.js": b"// inert",
    }
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w:gz") as package:
        for name, raw in core.items():
            entry = tarfile.TarInfo("package/" + name)
            entry.size = len(raw)
            package.addfile(entry, io.BytesIO(raw))
    raw = archive.getvalue()
    upstream = root / "inert-upstream.tgz"
    upstream.write_bytes(raw)
    manifest = MODULE.patched_manifest(json.loads(original))
    lock = MODULE.encoded(
        {
            "name": "npm",
            "version": MODULE.VARIANT_VERSION,
            "lockfileVersion": 3,
            "packages": {"": {"dependencies": manifest["dependencies"]}},
        }
    )
    inventory = MODULE.encoded(
        {
            name: {"bytes": len(content), "sha256": MODULE.sha(content)}
            for name, content in core.items()
        }
    )
    prepared = {
        **core,
        "package.json": MODULE.encoded(manifest),
        "package-lock.json": lock,
    }
    expected = MODULE.component_tar(prepared)
    pins = {
        "version": MODULE.UPSTREAM_VERSION,
        "variant": MODULE.VARIANT_VERSION,
        "url": MODULE.UPSTREAM_URL,
        "bytes": len(raw),
        "sha256": MODULE.sha(raw),
        "integrity": MODULE.sri(raw),
        "packageJsonSha256": MODULE.sha(original),
        "coreInventorySha256": MODULE.sha(inventory),
        "componentLockSha256": MODULE.sha(lock),
        "componentArchive": {
            "filename": MODULE.COMPONENT_FILENAME,
            "format": "ustar-uncompressed",
            "executableFiles": sorted(MODULE.EXECUTABLE_FILES),
            "bytes": len(expected),
            "sha256": MODULE.sha(expected),
            "integrity": MODULE.sri(expected),
        },
    }
    for name, content in {
        "upstream.json": MODULE.encoded(pins),
        "upstream-package.json": original,
        "upstream-core.json": inventory,
        "component-package.json": MODULE.encoded(manifest),
        "package-lock.json": lock,
    }.items():
        (component / name).write_bytes(content)
    return scripts / HELPER.name, component, upstream, expected


def command(helper, *arguments):
    """Each actual subprocess has a finite deadline and supplies its own real exit status."""
    return subprocess.run(
        [sys.executable, str(helper), *map(str, arguments)],
        check=False,
        capture_output=True,
        text=True,
        timeout=15,
    )


def independent_runs(text):
    """Reviewed native workflow contract: every required native command is one scalar step."""
    commands = re.findall(r"^\s+run:\s*(.+)$", text, re.MULTILINE)
    if not commands or any(
        value in {"|", ">", "|-", ">-"} or re.search(r"[;|&`]", value)
        for value in commands
    ):
        raise ValueError(
            "Required native commands must have independent failure statuses"
        )
    return commands


class ColdCli(unittest.TestCase):
    """Cold successful setup and real parser/failure controls; no downloads or vendor execution."""

    def test_cold_archive_then_package_then_verify_are_three_actual_commands(self):
        with tempfile.TemporaryDirectory(prefix="npm-cli-cold-") as temporary:
            helper, component, upstream, expected = cold_repository(Path(temporary))
            self.assertFalse((component / "source").exists())
            first = command(helper, "--archive", upstream)
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertFalse((component / MODULE.COMPONENT_FILENAME).exists())
            second = command(helper, "--package")
            self.assertEqual(second.returncode, 0, second.stderr)
            output = component / MODULE.COMPONENT_FILENAME
            self.assertEqual(output.read_bytes(), expected)
            before = output.stat()
            third = command(helper, "--verify")
            self.assertEqual(third.returncode, 0, third.stderr)
            self.assertFalse(json.loads(third.stdout)["networkUsed"])
            self.assertEqual(
                (before.st_ino, before.st_mtime_ns),
                (output.stat().st_ino, output.stat().st_mtime_ns),
            )

    def test_combined_modes_fail_in_the_real_parser_before_creating_source(self):
        with tempfile.TemporaryDirectory(prefix="npm-cli-exclusive-") as temporary:
            helper, component, upstream, _ = cold_repository(Path(temporary))
            for arguments in [
                ("--download", "--package"),
                ("--archive", str(upstream), "--package"),
            ]:
                with self.subTest(arguments=arguments):
                    result = command(helper, *arguments)
                    self.assertEqual(result.returncode, 2)
                    self.assertIn("not allowed with argument", result.stderr)
                    self.assertFalse((component / "source").exists())
                    self.assertFalse((component / MODULE.COMPONENT_FILENAME).exists())

    def test_invalid_cold_archive_returns_failure_without_any_package(self):
        with tempfile.TemporaryDirectory(prefix="npm-cli-failure-") as temporary:
            helper, component, upstream, _ = cold_repository(Path(temporary))
            upstream.write_bytes(b"incorrect archive; preserve me")
            before = hashlib.sha256(upstream.read_bytes()).hexdigest()
            result = command(helper, "--archive", upstream)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((component / "source").exists())
            self.assertFalse((component / MODULE.COMPONENT_FILENAME).exists())
            self.assertEqual(hashlib.sha256(upstream.read_bytes()).hexdigest(), before)

    def test_all_cold_workflow_modes_are_separate_and_valid_in_the_actual_parser(self):
        for name in ["ci.yml", "codeql.yml", "native-app.yml"]:
            text = (ROOT / ".github/workflows" / name).read_text(encoding="utf-8")
            modes = re.findall(
                r"^\s+run: python scripts/prepare-npm-component.py (.+)$",
                text,
                re.MULTILINE,
            )
            self.assertEqual(modes, ["--download", "--package"], name)
            for mode in modes:
                # Help stops before any network/filesystem admission but still runs
                # the real argparse mutually-exclusive-mode validation in order.
                result = command(HELPER, mode, "--help")
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_native_required_commands_cannot_mask_a_prior_native_exit(self):
        text = (ROOT / ".github/workflows/native-app.yml").read_text(encoding="utf-8")
        commands = independent_runs(text)
        for required in [
            "corepack enable",
            "pnpm install --frozen-lockfile",
            "npm --prefix desktop ci --ignore-scripts",
            "npm --prefix native-runtime ci --ignore-scripts --install-links",
            "node desktop/node_modules/electron/install.js",
            "node scripts/verify-physical-runtime.mjs development",
            "node scripts/verify-physical-runtime.mjs native",
            "npm --prefix native-runtime audit --audit-level=moderate",
            "npm --prefix desktop audit --audit-level=moderate",
            "pnpm audit --audit-level=moderate",
            'python -m unittest discover -s native-installer/tests -p "test_prepare*.py" -v',
            "python native-installer/tests/offline_cli.py --node desktop/node_modules/electron/dist/electron.exe --component native --output artifacts/native-tooling/npm-cli-hosted-native",
            "python native-installer/tests/offline_cli.py --node desktop/node_modules/electron/dist/electron.exe --component development --output artifacts/native-tooling/npm-cli-hosted-development",
            "pnpm build",
            "pnpm native:test",
            "python -m unittest discover -s tests -p test_native_archive.py -v",
            "node scripts/build-native.mjs release/hosted",
            "python scripts/archive_native.py release/hosted/win-unpacked .runtime/native-hosted",
        ]:
            self.assertEqual(commands.count(required), 1, required)
        for mutation in [
            text.replace("run: pnpm build", "run: pnpm build; pnpm native:test"),
            text.replace(
                "run: pnpm build",
                "run: |\n          pnpm build\n          pnpm native:test",
            ),
        ]:
            with self.assertRaises(ValueError):
                independent_runs(mutation)


if __name__ == "__main__":
    unittest.main()
