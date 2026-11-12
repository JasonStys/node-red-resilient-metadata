"""Jason Stys: real-byte source, archive and dependency-lock admission regressions.

These controls execute no downloaded code, require no network and preserve real
sentinels when malformed archives, aliases, graph changes or oversized input fail.

Declaration locations (generated from this file):
Module variables: ROOT@49, SPEC@50, MODULE@53.
archive@57; parameters/local bindings: entries@57, result@59, output@60, name@61, data@61, kind@61, member@62.
valid_entries@73; parameters/local bindings: name@77, data@77.
PrepareBoundaries@87.
test_manifest_changes_are_only_the_disclosed_metadata_patch@90; parameters/local bindings: self@90, original@92, result@95, allowed@96, field@113, key@108, value@108.
test_wrong_upstream_version_is_refused@136; parameters/local bindings: self@136.
test_duplicate_and_nonfinite_json_are_refused@141; parameters/local bindings: self@141, raw@143.
test_real_tar_omits_bundled_dependencies_without_altering_core@147; parameters/local bindings: self@147, entries@149, result@150, name@163, data@163, _@163.
test_real_traversal_absolute_and_duplicate_names_are_refused@166; parameters/local bindings: self@166, name@168.
test_archive_symlinks_and_hardlinks_are_refused@181; parameters/local bindings: self@181, kind@183.
test_member_and_count_limits_apply_to_real_headers@192; parameters/local bindings: self@192.
test_incomplete_core_is_not_success@209; parameters/local bindings: self@209.
test_both_real_archive_digests_are_required@214; parameters/local bindings: self@214, raw@216, pins@217.
test_real_hardlink_is_refused_without_changing_original@225; parameters/local bindings: self@225, temporary@227, root@228, file@229, alias@229.
test_real_file_and_directory_budgets@236; parameters/local bindings: self@236, temporary@238, root@239, file@240.
check_lock_mutation@247; parameters/local bindings: self@247, mutate@247, message@247, temporary@249, root@250, name@251, lock@259, changed@261, pins@263.
test_consistently_hashed_lock_cannot_introduce_registry_alias@272; parameters/local bindings: self@272.
test_consistently_hashed_lock_cannot_introduce_link_or_bundle@281; parameters/local bindings: self@281, field@283.
test_consistently_hashed_lock_cannot_keep_old_matching_leaf@292; parameters/local bindings: self@292.
test_actual_current_frozen_contract_is_ordinary_and_patched@299; parameters/local bindings: self@299, pins@301, manifest@301, inventory@301, raw@301.
test_component_tar_is_order_independent_and_metadata_is_fixed@308; parameters/local bindings: self@308, core@310, raw@312, archive@314, member@318, name@310.
test_component_tar_refuses_alias_traversal_dependencies_and_byte_budgets@330; parameters/local bindings: self@330, name@332.
test_component_tar_requires_both_reviewed_digests@357; parameters/local bindings: self@357, raw@359, expected@360, field@366, value@366.
component_fixture@379; parameters/local bindings: self@379, root@379, source@381, core@384, inventory@385, raw@392, pins@393, manifest@383, lock_raw@383, name@390.
test_component_package_is_exclusive_and_repeated_use_is_read_only@402; parameters/local bindings: self@402, temporary@404, root@405, source@406, pins@406, manifest@406, inventory@406, lock_raw@406, raw@406, output@410, before@414, after@416.
test_conflicting_existing_component_tar_is_preserved_and_refused@422; parameters/local bindings: self@422, temporary@424, root@425, output@429, sentinel@430, source@426, pins@426, manifest@426, inventory@426, lock_raw@426, _@426.
test_changed_manifest_lock_core_or_unknown_source_never_creates_tar@439; parameters/local bindings: self@439, name@441, temporary@444, root@446, source@447, pins@447, manifest@447, inventory@447, lock_raw@447, _@447.
test_hardlinked_prepared_source_never_creates_tar@461; parameters/local bindings: self@461, temporary@463, root@464, alias@468, source@465, pins@465, manifest@465, inventory@465, lock_raw@465, _@465.
End declaration locations.
"""

import hashlib
import importlib.util
import io
import os
import shutil
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "prepare_npm_component", ROOT / "scripts/prepare-npm-component.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def archive(entries):
    """Create actual tar bytes instead of mocking the archive reader or selected paths."""
    result = io.BytesIO()
    with tarfile.open(fileobj=result, mode="w:gz") as output:
        for name, data, kind in entries:
            member = tarfile.TarInfo(name)
            member.type = kind
            member.size = len(data) if kind == tarfile.REGTYPE else 0
            if kind in {tarfile.SYMTYPE, tarfile.LNKTYPE}:
                member.linkname = "../outside"
            output.addfile(
                member, io.BytesIO(data) if kind == tarfile.REGTYPE else None
            )
    return result.getvalue()


def valid_entries():
    """Known inert source inventory; no executable installer is run by the controls."""
    return [
        ("package/" + name, data, tarfile.REGTYPE)
        for name, data in {
            "package.json": b'{"name":"npm","version":"12.2.2","dependencies":{}}',
            "LICENSE": b"synthetic terms",
            "README.md": b"synthetic upstream readme",
            "bin/npm-cli.js": b"// inert fixture only",
            "index.js": b"// inert fixture only",
        }.items()
    ]


class PrepareBoundaries(unittest.TestCase):
    """Prepareboundaries."""

    def test_manifest_changes_are_only_the_disclosed_metadata_patch(self):
        """Manifest changes are only the disclosed metadata patch."""
        original = MODULE.parsed(
            (ROOT / "native-installer/upstream-package.json").read_bytes()
        )
        result = MODULE.patched_manifest(original)
        allowed = {
            "version",
            "private",
            "dependencies",
            "overrides",
            "bundleDependencies",
            "bundledDependencies",
            "devDependencies",
            "workspaces",
            "scripts",
        }
        self.assertEqual(
            {key: value for key, value in original.items() if key not in allowed},
            {key: value for key, value in result.items() if key not in allowed},
        )
        self.assertEqual(result["version"], "12.2.2+workbench.1")
        self.assertTrue(result["private"])
        for field in [
            "bundleDependencies",
            "bundledDependencies",
            "devDependencies",
            "workspaces",
            "scripts",
        ]:
            self.assertNotIn(field, result)
        self.assertEqual(
            {
                key: value
                for key, value in original["dependencies"].items()
                if key not in {"glob", "minimatch"}
            },
            {
                key: value
                for key, value in result["dependencies"].items()
                if key not in {"glob", "minimatch"}
            },
        )
        self.assertEqual(result["dependencies"]["glob"], "14.0.2")
        self.assertEqual(result["dependencies"]["minimatch"], "11.0.5")

    def test_wrong_upstream_version_is_refused(self):
        """Wrong upstream version is refused."""
        with self.assertRaisesRegex(ValueError, "Unexpected upstream"):
            MODULE.patched_manifest({"name": "npm", "version": "0.0.0"})

    def test_duplicate_and_nonfinite_json_are_refused(self):
        """Duplicate and nonfinite json are refused."""
        for raw in [b'{"url":1,"url":2}', b'{"value":NaN}', b'{"value":Infinity}']:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                MODULE.parsed(raw)

    def test_real_tar_omits_bundled_dependencies_without_altering_core(self):
        """Real tar omits bundled dependencies without altering core."""
        entries = valid_entries()
        result = MODULE.parse_core(
            archive(
                entries
                + [
                    (
                        "package/node_modules/old-leaf/ignored.js",
                        b"never copied",
                        tarfile.REGTYPE,
                    )
                ]
            )
        )
        self.assertEqual(
            result, {name.removeprefix("package/"): data for name, data, _ in entries}
        )

    def test_real_traversal_absolute_and_duplicate_names_are_refused(self):
        """Real traversal absolute and duplicate names are refused."""
        for name in [
            "package/../outside",
            "/package/outside",
            "package//outside",
            "package/README.md",
            "package/readme.md",
            "package/c:/outside",
        ]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                MODULE.parse_core(
                    archive(valid_entries() + [(name, b"bad", tarfile.REGTYPE)])
                )

    def test_archive_symlinks_and_hardlinks_are_refused(self):
        """Archive symlinks and hardlinks are refused."""
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE]:
            with (
                self.subTest(kind=kind),
                self.assertRaisesRegex(ValueError, "Linked or special"),
            ):
                MODULE.parse_core(
                    archive(valid_entries() + [("package/alias", b"", kind)])
                )

    def test_member_and_count_limits_apply_to_real_headers(self):
        """Member and count limits apply to real headers."""
        with (
            mock.patch.object(MODULE, "MAX_MEMBERS", 4),
            self.assertRaisesRegex(ValueError, "budget"),
        ):
            MODULE.parse_core(archive(valid_entries()))
        with (
            mock.patch.object(MODULE, "MAX_MEMBER", 64),
            self.assertRaisesRegex(ValueError, "budget"),
        ):
            MODULE.parse_core(
                archive(
                    valid_entries() + [("package/large", b"x" * 65, tarfile.REGTYPE)]
                )
            )

    def test_incomplete_core_is_not_success(self):
        """Incomplete core is not success."""
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            MODULE.parse_core(archive(valid_entries()[:-1]))

    def test_both_real_archive_digests_are_required(self):
        """Both real archive digests are required."""
        raw = b"owned synthetic compressed bytes"
        pins = {
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "integrity": "sha512-incorrect",
        }
        with self.assertRaisesRegex(ValueError, "identity"):
            MODULE.verify_archive(raw, pins)

    def test_real_hardlink_is_refused_without_changing_original(self):
        """Real hardlink is refused without changing original."""
        with tempfile.TemporaryDirectory(prefix="npm-component-test-") as temporary:
            root = Path(temporary)
            file, alias = root / "source", root / "alias"
            file.write_bytes(b"preserve exact source")
            os.link(file, alias)
            with self.assertRaisesRegex(ValueError, "Single-link"):
                MODULE.read_regular(alias, 1024)
            self.assertEqual(file.read_bytes(), b"preserve exact source")

    def test_real_file_and_directory_budgets(self):
        """Real file and directory budgets."""
        with tempfile.TemporaryDirectory(prefix="npm-component-test-") as temporary:
            root = Path(temporary)
            file = root / "source"
            file.write_bytes(b"x" * 33)
            with self.assertRaisesRegex(ValueError, "budget"):
                MODULE.read_regular(file, 32)
            with self.assertRaisesRegex(ValueError, "regular"):
                MODULE.read_regular(root, 1024)

    def check_lock_mutation(self, mutate, message):
        """Even self-consistent altered lock bytes must pass semantic authority/version checks."""
        with tempfile.TemporaryDirectory(prefix="npm-component-test-") as temporary:
            root = Path(temporary)
            for name in [
                "upstream.json",
                "upstream-package.json",
                "upstream-core.json",
                "component-package.json",
                "package-lock.json",
            ]:
                shutil.copyfile(ROOT / "native-installer" / name, root / name)
            lock = MODULE.parsed((root / "package-lock.json").read_bytes())
            mutate(lock)
            changed = MODULE.encoded(lock)
            (root / "package-lock.json").write_bytes(changed)
            pins = MODULE.parsed((root / "upstream.json").read_bytes())
            pins["componentLockSha256"] = MODULE.sha(changed)
            (root / "upstream.json").write_bytes(MODULE.encoded(pins))
            with (
                mock.patch.object(MODULE, "COMPONENT", root),
                self.assertRaisesRegex(ValueError, message),
            ):
                MODULE.load_contract()

    def test_consistently_hashed_lock_cannot_introduce_registry_alias(self):
        """Consistently hashed lock cannot introduce registry alias."""
        self.check_lock_mutation(
            lambda lock: lock["packages"]["node_modules/glob"].update(
                resolved="https://registry.npmjs.org.attacker.invalid/glob.tgz"
            ),
            "official registry",
        )

    def test_consistently_hashed_lock_cannot_introduce_link_or_bundle(self):
        """Consistently hashed lock cannot introduce link or bundle."""
        for field in ["inBundle", "link"]:
            with self.subTest(field=field):
                self.check_lock_mutation(
                    lambda lock: lock["packages"]["node_modules/glob"].update(
                        {field: True}
                    ),
                    "unbundled",
                )

    def test_consistently_hashed_lock_cannot_keep_old_matching_leaf(self):
        """Consistently hashed lock cannot keep old matching leaf."""
        self.check_lock_mutation(
            lambda lock: lock["packages"]["node_modules/glob"].update(version="13.0.6"),
            "unpatched",
        )

    def test_actual_current_frozen_contract_is_ordinary_and_patched(self):
        """Actual current frozen contract is ordinary and patched."""
        pins, manifest, inventory, raw = MODULE.load_contract()
        self.assertEqual(pins["variant"], "12.2.2+workbench.1")
        self.assertEqual(len(inventory), 417)
        self.assertEqual(
            MODULE.parsed(raw)["packages"][""]["dependencies"], manifest["dependencies"]
        )

    def test_component_tar_is_order_independent_and_metadata_is_fixed(self):
        """Read every actual TAR header and body, including all ten upstream executable modes."""
        core = {name: b"inert source" for name in MODULE.EXECUTABLE_FILES}
        core.update({"package.json": b"{}", "LICENSE": b"retained terms"})
        raw = MODULE.component_tar(core)
        self.assertEqual(raw, MODULE.component_tar(dict(reversed(list(core.items())))))
        with tarfile.open(fileobj=io.BytesIO(raw), mode="r:") as archive:
            self.assertEqual(
                archive.getnames(), ["package/" + name for name in sorted(core)]
            )
            for member in archive:
                name = member.name.removeprefix("package/")
                self.assertTrue(member.isfile())
                self.assertEqual(archive.extractfile(member).read(), core[name])
                self.assertEqual(
                    member.mode, 0o755 if name in MODULE.EXECUTABLE_FILES else 0o644
                )
                self.assertEqual((member.uid, member.gid, member.mtime), (0, 0, 0))
                self.assertEqual(
                    (member.uname, member.gname, member.pax_headers), ("", "", {})
                )

    def test_component_tar_refuses_alias_traversal_dependencies_and_byte_budgets(self):
        """Unsafe input cannot become a valid local package path or unbounded TAR allocation."""
        for name in [
            "../outside",
            "/absolute",
            "a/../b",
            "a\\b",
            "a:drive",
            "a.",
            "node_modules/x",
            "a//b",
        ]:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "Unsafe"):
                MODULE.component_tar({name: b"x"})
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            MODULE.component_tar({"A": b"x", "a": b"y"})
        with (
            mock.patch.object(MODULE, "MAX_MEMBER", 2),
            self.assertRaisesRegex(ValueError, "budget"),
        ):
            MODULE.component_tar({"data": b"xxx"})
        with (
            mock.patch.object(MODULE, "MAX_COMPONENT_ARCHIVE", 4),
            self.assertRaisesRegex(ValueError, "budget"),
        ):
            MODULE.component_tar({"data": b"xxx"})

    def test_component_tar_requires_both_reviewed_digests(self):
        """A correct SHA256 cannot conceal a changed lock-manager SHA512 identity, or vice versa."""
        raw = MODULE.component_tar({"fixture": b"owned inert bytes"})
        expected = {
            "bytes": len(raw),
            "sha256": MODULE.sha(raw),
            "integrity": MODULE.sri(raw),
        }
        MODULE.verify_component_tar(raw, {"componentArchive": expected})
        for field, value in [
            ("sha256", "0" * 64),
            ("integrity", "sha512-wrong"),
            ("bytes", len(raw) - 1),
        ]:
            with (
                self.subTest(field=field),
                self.assertRaisesRegex(ValueError, "differs"),
            ):
                MODULE.verify_component_tar(
                    raw, {"componentArchive": {**expected, field: value}}
                )

    def component_fixture(self, root):
        """Build a real ordinary fixture with independent expected inventory and exact TAR pins."""
        source = root / "source"
        source.mkdir()
        manifest, lock_raw = {"name": "inert-control"}, b'{"lockfileVersion":3}\n'
        core = {"LICENSE": b"preserved terms", "package.json": MODULE.encoded(manifest)}
        inventory = {
            name: {"bytes": len(raw), "sha256": MODULE.sha(raw)}
            for name, raw in core.items()
        }
        core["package-lock.json"] = lock_raw
        for name, raw in core.items():
            (source / name).write_bytes(raw)
        raw = MODULE.component_tar(core)
        pins = {
            "componentArchive": {
                "bytes": len(raw),
                "sha256": MODULE.sha(raw),
                "integrity": MODULE.sri(raw),
            }
        }
        return source, pins, manifest, inventory, lock_raw, raw

    def test_component_package_is_exclusive_and_repeated_use_is_read_only(self):
        """Same-byte packaging succeeds without replacing an existing local TAR identity."""
        with tempfile.TemporaryDirectory(prefix="npm-tar-control-") as temporary:
            root = Path(temporary)
            source, pins, manifest, inventory, lock_raw, raw = self.component_fixture(
                root
            )
            with mock.patch.object(MODULE, "COMPONENT", root):
                output = MODULE.package_source(
                    source, pins, manifest, inventory, lock_raw
                )
                self.assertEqual(output.read_bytes(), raw)
                before = output.stat()
                MODULE.package_source(source, pins, manifest, inventory, lock_raw)
                after = output.stat()
                self.assertEqual(
                    (before.st_ino, before.st_mtime_ns),
                    (after.st_ino, after.st_mtime_ns),
                )

    def test_conflicting_existing_component_tar_is_preserved_and_refused(self):
        """A selected output cannot be silently replaced just because its filename is expected."""
        with tempfile.TemporaryDirectory(prefix="npm-tar-conflict-") as temporary:
            root = Path(temporary)
            source, pins, manifest, inventory, lock_raw, _ = self.component_fixture(
                root
            )
            output = root / MODULE.COMPONENT_FILENAME
            sentinel = b"preserve conflicting output"
            output.write_bytes(sentinel)
            with (
                mock.patch.object(MODULE, "COMPONENT", root),
                self.assertRaisesRegex(ValueError, "differs"),
            ):
                MODULE.package_source(source, pins, manifest, inventory, lock_raw)
            self.assertEqual(output.read_bytes(), sentinel)

    def test_changed_manifest_lock_core_or_unknown_source_never_creates_tar(self):
        """All prepared inputs remain admitted by exact content, not by a trusted directory name."""
        for name in ["package.json", "package-lock.json", "LICENSE", "unknown"]:
            with (
                self.subTest(name=name),
                tempfile.TemporaryDirectory(prefix="npm-tar-mutation-") as temporary,
            ):
                root = Path(temporary)
                source, pins, manifest, inventory, lock_raw, _ = self.component_fixture(
                    root
                )
                (source / name).write_bytes(b"preserve changed input")
                with (
                    mock.patch.object(MODULE, "COMPONENT", root),
                    self.assertRaises(ValueError),
                ):
                    MODULE.package_source(source, pins, manifest, inventory, lock_raw)
                self.assertFalse((root / MODULE.COMPONENT_FILENAME).exists())
                self.assertEqual(
                    (source / name).read_bytes(), b"preserve changed input"
                )

    def test_hardlinked_prepared_source_never_creates_tar(self):
        """Packaging retains the original single-link guard after package-manager import tests."""
        with tempfile.TemporaryDirectory(prefix="npm-tar-hardlink-") as temporary:
            root = Path(temporary)
            source, pins, manifest, inventory, lock_raw, _ = self.component_fixture(
                root
            )
            alias = root / "license-alias"
            os.link(source / "LICENSE", alias)
            with (
                mock.patch.object(MODULE, "COMPONENT", root),
                self.assertRaisesRegex(ValueError, "Single-link"),
            ):
                MODULE.package_source(source, pins, manifest, inventory, lock_raw)
            self.assertFalse((root / MODULE.COMPONENT_FILENAME).exists())
            self.assertEqual(alias.read_bytes(), b"preserved terms")


if __name__ == "__main__":
    unittest.main(verbosity=2)
