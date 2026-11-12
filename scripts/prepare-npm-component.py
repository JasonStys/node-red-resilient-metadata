"""Jason Stys: prepare a disclosed npm dependency variant from verified upstream bytes.

The genuine upstream CLI/core/terms remain byte-identical. Only package metadata
changes: an explicit variant identity, unbundled dependencies, patched glob and
minimatch, and removal of upstream-development-only metadata. No package script,
global installation, account store, arbitrary endpoint or installer shim is used.
Functions validate input bytes, bound tar inventory, prepare or verify an owned
source directory, and enforce its frozen ordinary dependency graph.

Declarations, parameters and local bindings: generated docs/code-map.md (pnpm code-map).
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import stat
import tarfile
import urllib.request
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "native-installer"
UPSTREAM_VERSION = "12.2.2"
VARIANT_VERSION = "12.2.2+workbench.1"
UPSTREAM_URL = "https://registry.npmjs.org/npm/-/npm-12.2.2.tgz"
MAX_ARCHIVE = 32 * 1024 * 1024
MAX_EXPANDED = 512 * 1024 * 1024
MAX_CORE = 32 * 1024 * 1024
MAX_MEMBER = 16 * 1024 * 1024
MAX_MEMBERS = 50000
PATCHED = {"glob": "14.0.2", "minimatch": "11.0.5"}
COMPONENT_FILENAME = "npm-12.2.2-workbench.1.tar"
MAX_COMPONENT_ARCHIVE = 64 * 1024 * 1024
EXECUTABLE_FILES = frozenset(
    {
        "bin/node-gyp-bin/node-gyp",
        "bin/node-gyp-bin/node-gyp.cmd",
        "bin/npm",
        "bin/npm.cmd",
        "bin/npm-cli.js",
        "bin/npm-prefix.js",
        "bin/npx",
        "bin/npx.cmd",
        "bin/npx-cli.js",
        "lib/utils/completion.sh",
    }
)


def require(condition, message):
    """Keep every admission check effective under optimized Python."""
    if not condition:
        raise ValueError(message)


def linked(info):
    """Reject symbolic links and Windows reparse points before opening selected data."""
    return stat.S_ISLNK(info.st_mode) or bool(
        getattr(info, "st_file_attributes", 0)
        & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    )


def ordinary_ancestors(directory):
    """Check ordinary existing ancestors without creating or adopting an unknown folder."""
    for item in (directory.absolute(), *directory.absolute().parents):
        try:
            info = item.lstat()
        except FileNotFoundError:
            continue
        require(
            stat.S_ISDIR(info.st_mode) and not linked(info),
            "Ordinary source ancestors required",
        )


def read_regular(file, maximum):
    """Read one same-identity bounded descriptor; files and aliases cannot redirect setup."""
    ordinary_ancestors(file.parent)
    named = file.lstat()
    require(
        stat.S_ISREG(named.st_mode) and named.st_nlink == 1 and not linked(named),
        "Single-link regular input required",
    )
    descriptor = os.open(
        file,
        os.O_RDONLY
        | getattr(os, "O_BINARY", 0)
        | getattr(os, "O_NOFOLLOW", 0)
        | getattr(os, "O_NONBLOCK", 0),
    )
    with os.fdopen(descriptor, "rb") as stream:
        actual = os.fstat(stream.fileno())
        require(
            (actual.st_dev, actual.st_ino, actual.st_size)
            == (named.st_dev, named.st_ino, named.st_size)
            and actual.st_size <= maximum
            and actual.st_nlink == 1
            and stat.S_ISREG(actual.st_mode),
            "Input identity or budget differs",
        )
        raw = stream.read(actual.st_size + 1)
        require(
            len(raw) == actual.st_size
            and os.fstat(stream.fileno()).st_mtime_ns == actual.st_mtime_ns,
            "Input changed during its bounded read",
        )
        return raw


def unique_object(pairs):
    """Refuse repeated JSON keys rather than silently changing a pin or lock value."""
    result = {}
    for key, value in pairs:
        require(key not in result, "Duplicate JSON key refused")
        result[key] = value
    return result


def parsed(raw):
    """Decode UTF-8 JSON data only; package code is never imported by this helper."""
    return json.loads(
        raw.decode("utf-8"),
        object_pairs_hook=unique_object,
        parse_constant=lambda _: require(False, "Non-finite JSON refused"),
    )


def sha(raw):
    """Return a content identity, not an authentication or publisher-signing claim."""
    return hashlib.sha256(raw).hexdigest()


def sri(raw):
    """Bind the exact local tar bytes in both package-manager lock formats."""
    return "sha512-" + base64.b64encode(hashlib.sha512(raw).digest()).decode("ascii")


def component_tar(core):
    """Serialize only finite ordinary files with reproducible USTAR metadata and modes."""
    require(0 < len(core) < 5000, "Component inventory budget exceeded")
    seen, total = set(), 0
    for name, raw in core.items():
        path = PurePosixPath(name)
        require(
            name == path.as_posix()
            and not path.is_absolute()
            and path.parts
            and "node_modules" not in path.parts
            and all(
                part not in ("", ".", "..")
                and ":" not in part
                and "\\" not in part
                and not part.endswith((" ", "."))
                for part in path.parts
            ),
            "Unsafe component archive name",
        )
        require(name.casefold() not in seen, "Duplicate component archive member")
        seen.add(name.casefold())
        require(isinstance(raw, bytes), "Component members must be byte strings")
        total += len(raw)
        require(
            len(raw) <= MAX_MEMBER and total <= MAX_COMPONENT_ARCHIVE // 2,
            "Component archive byte budget exceeded",
        )
    result = io.BytesIO()
    with tarfile.open(fileobj=result, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for name in sorted(core):
            raw = core[name]
            member = tarfile.TarInfo("package/" + name)
            member.type = tarfile.REGTYPE
            member.size = len(raw)
            member.mode = 0o755 if name in EXECUTABLE_FILES else 0o644
            member.uid = member.gid = member.mtime = 0
            member.uname = member.gname = ""
            archive.addfile(member, io.BytesIO(raw))
    raw = result.getvalue()
    require(len(raw) <= MAX_COMPONENT_ARCHIVE, "Component archive budget exceeded")
    return raw


def verify_component_tar(raw, pins):
    """Require length and both reviewed identities before installing a local tar component."""
    expected = pins["componentArchive"]
    require(
        0 < len(raw) <= MAX_COMPONENT_ARCHIVE and len(raw) == expected["bytes"],
        "Component archive size differs",
    )
    require(
        sha(raw) == expected["sha256"] and sri(raw) == expected["integrity"],
        "Component archive identity differs",
    )


def package_source(source, pins, manifest, inventory, lock_raw):
    """Package verified single-link source, preserving and refusing any conflicting output."""
    verify_source(source, inventory, manifest, lock_raw)
    names = set(inventory) | {"package-lock.json"}
    core = {name: read_regular(source / name, MAX_MEMBER) for name in names}
    for name, raw in core.items():
        if name == "package.json":
            require(
                raw == encoded(manifest), "Component manifest changed before packaging"
            )
        elif name == "package-lock.json":
            require(raw == lock_raw, "Component lock changed before packaging")
        else:
            require(
                len(raw) == inventory[name]["bytes"]
                and sha(raw) == inventory[name]["sha256"],
                "Component source changed before packaging",
            )
    raw = component_tar(core)
    verify_component_tar(raw, pins)
    output = COMPONENT / COMPONENT_FILENAME
    ordinary_ancestors(output.parent)
    try:
        with output.open("xb") as stream:
            stream.write(raw)
    except FileExistsError:
        verify_component_tar(read_regular(output, MAX_COMPONENT_ARCHIVE), pins)
    verify_component_tar(read_regular(output, MAX_COMPONENT_ARCHIVE), pins)
    return output


def encoded(value):
    """Use stable readable package metadata with a final newline."""
    return (
        json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    ).encode("utf-8")


def patched_manifest(original):
    """Disclose a manifest-only variant; retain all upstream CLI/core and original authorship."""
    require(
        original.get("name") == "npm" and original.get("version") == UPSTREAM_VERSION,
        "Unexpected upstream npm package",
    )
    result = json.loads(json.dumps(original))
    for key in (
        "bundleDependencies",
        "bundledDependencies",
        "devDependencies",
        "workspaces",
        "scripts",
    ):
        result.pop(key, None)
    result["version"] = VARIANT_VERSION
    result["private"] = True
    result["dependencies"].update(PATCHED)
    result["overrides"] = PATCHED.copy()
    return result


def verify_archive(raw, pins):
    """Require both the official SHA512 SRI and independently recorded SHA256/length."""
    require(
        0 < len(raw) <= MAX_ARCHIVE and len(raw) == pins["bytes"],
        "Upstream archive size differs",
    )
    require(
        sha(raw) == pins["sha256"]
        and "sha512-" + base64.b64encode(hashlib.sha512(raw).digest()).decode("ascii")
        == pins["integrity"],
        "Upstream archive identity differs",
    )


def parse_core(raw):
    """Stream a finite ordinary tar, omit bundled dependencies, and never extract an archive path."""
    core, seen, total, core_bytes, count = {}, set(), 0, 0, 0
    require(len(raw) <= MAX_ARCHIVE, "Compressed archive budget exceeded")
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r|gz") as archive:
        for member in archive:
            count += 1
            total += member.size
            require(
                count <= MAX_MEMBERS
                and total <= MAX_EXPANDED
                and 0 <= member.size <= MAX_MEMBER,
                "Expanded archive budget exceeded",
            )
            path = PurePosixPath(member.name)
            require(
                member.name == path.as_posix()
                and not path.is_absolute()
                and path.parts
                and path.parts[0] == "package"
                and all(
                    part not in ("", ".", "..")
                    and ":" not in part
                    and "\\" not in part
                    and not part.endswith((" ", "."))
                    for part in path.parts
                ),
                "Unsafe upstream archive name",
            )
            require(
                member.isfile() or member.isdir(),
                "Linked or special upstream member refused",
            )
            require(
                member.name.casefold() not in seen, "Duplicate upstream archive member"
            )
            seen.add(member.name.casefold())
            if member.isdir() or len(path.parts) < 2 or path.parts[1] == "node_modules":
                continue
            core_bytes += member.size
            require(core_bytes <= MAX_CORE, "Upstream core budget exceeded")
            source = archive.extractfile(member)
            require(source is not None, "Ordinary tar member missing")
            with source:
                content = source.read(member.size + 1)
            require(
                len(content) == member.size, "Actual upstream member length differs"
            )
            core[PurePosixPath(*path.parts[1:]).as_posix()] = content
    require(
        {"package.json", "LICENSE", "README.md", "bin/npm-cli.js", "index.js"}
        <= set(core),
        "Incomplete upstream npm core",
    )
    return core


def load_contract():
    """Bind pins, byte-identical core inventory, exact metadata patch and frozen unbundled lock."""
    pins = parsed(read_regular(COMPONENT / "upstream.json", 32768))
    require(
        pins["url"] == UPSTREAM_URL
        and pins["version"] == UPSTREAM_VERSION
        and pins["variant"] == VARIANT_VERSION,
        "Unexpected component identity",
    )
    archive_pin = pins["componentArchive"]
    require(
        archive_pin["filename"] == COMPONENT_FILENAME
        and archive_pin["format"] == "ustar-uncompressed"
        and archive_pin["executableFiles"] == sorted(EXECUTABLE_FILES)
        and isinstance(archive_pin["bytes"], int)
        and 0 < archive_pin["bytes"] <= MAX_COMPONENT_ARCHIVE
        and isinstance(archive_pin["sha256"], str)
        and len(archive_pin["sha256"]) == 64
        and isinstance(archive_pin["integrity"], str)
        and archive_pin["integrity"].startswith("sha512-"),
        "Unexpected component archive contract",
    )
    raw_package = read_regular(COMPONENT / "upstream-package.json", 128 * 1024)
    require(
        sha(raw_package) == pins["packageJsonSha256"],
        "Upstream package metadata differs",
    )
    manifest = patched_manifest(parsed(raw_package))
    require(
        parsed(read_regular(COMPONENT / "component-package.json", 128 * 1024))
        == manifest,
        "Component metadata differs from the disclosed patch",
    )
    inventory_raw = read_regular(COMPONENT / "upstream-core.json", 512 * 1024)
    require(
        sha(inventory_raw) == pins["coreInventorySha256"],
        "Upstream core inventory differs",
    )
    inventory = parsed(inventory_raw)
    require(0 < len(inventory) < 5000, "Core inventory budget exceeded")
    lock_raw = read_regular(COMPONENT / "package-lock.json", 4 * 1024 * 1024)
    require(
        sha(lock_raw) == pins["componentLockSha256"], "Frozen component lock differs"
    )
    lock = parsed(lock_raw)
    require(
        lock["name"] == "npm"
        and lock["version"] == VARIANT_VERSION
        and lock["lockfileVersion"] == 3,
        "Wrong component lock",
    )
    require(
        lock["packages"][""]["dependencies"] == manifest["dependencies"],
        "Component root dependency graph differs",
    )
    for name, package in lock["packages"].items():
        require(
            not package.get("inBundle") and not package.get("link"),
            "Component graph must be ordinary unbundled dependencies",
        )
        if name:
            require(
                name.startswith("node_modules/")
                and ".." not in PurePosixPath(name).parts
                and "\\" not in name,
                "Unsafe dependency lock location",
            )
            url = urlsplit(package.get("resolved", ""))
            require(
                url.scheme == "https"
                and url.netloc == "registry.npmjs.org"
                and not url.query
                and not url.fragment
                and not url.username
                and not url.password,
                "Only pinned official registry dependencies are supported",
            )
            require(
                isinstance(package.get("integrity"), str)
                and package["integrity"].startswith("sha512-"),
                "Dependency integrity is required",
            )
        for leaf, version in PATCHED.items():
            if name.endswith("node_modules/" + leaf):
                require(
                    package["version"] == version, "An unpatched matching leaf remains"
                )
    return pins, manifest, inventory, lock_raw


def verify_source(source, inventory, manifest, lock_raw):
    """Verify every original core byte; only a real generated node_modules directory is additional."""
    ordinary_ancestors(source)
    expected = {name: item.copy() for name, item in inventory.items()}
    for name, content in {
        "package.json": encoded(manifest),
        "package-lock.json": lock_raw,
    }.items():
        expected[name] = {"bytes": len(content), "sha256": sha(content)}
    found, pending, entries = set(), [source], 0
    while pending:
        directory = pending.pop()
        with os.scandir(directory) as names:
            for entry in names:
                entries += 1
                require(entries <= 5000, "Prepared core entry budget exceeded")
                file = Path(entry.path)
                info = file.lstat()
                require(not linked(info), "Prepared core alias refused")
                relative = file.relative_to(source).as_posix()
                if relative == "node_modules":
                    require(
                        stat.S_ISDIR(info.st_mode),
                        "Generated dependencies must be a real directory",
                    )
                    continue
                if stat.S_ISDIR(info.st_mode):
                    pending.append(file)
                    continue
                require(relative in expected, "Unknown prepared core member preserved")
                raw = read_regular(file, MAX_MEMBER)
                require(
                    len(raw) == expected[relative]["bytes"]
                    and sha(raw) == expected[relative]["sha256"],
                    "Prepared upstream core bytes differ",
                )
                found.add(relative)
    require(found == set(expected), "Prepared source core is incomplete")
    return len(found)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """The verified upstream registry URL cannot redirect setup to another authority."""

    def redirect_request(self, request, response, code, message, headers, new_url):
        """Redirect request."""
        raise ValueError("Upstream source redirects are not accepted")


def main():
    """Download only by explicit build flag, or use a verified local archive; never replace source."""
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--download", action="store_true")
    mode.add_argument("--archive", type=Path)
    mode.add_argument("--verify", action="store_true")
    mode.add_argument("--package", action="store_true")
    args = parser.parse_args()
    pins, manifest, inventory, lock_raw = load_contract()
    # The exact source TAR is tracked for package-manager/updater cold checkouts.
    # Admit it before any network request or prepared-source mutation; never repair
    # a changed source input by overwriting it with freshly generated bytes.
    tracked_archive = COMPONENT / COMPONENT_FILENAME
    if tracked_archive.exists() or tracked_archive.is_symlink():
        verify_component_tar(read_regular(tracked_archive, MAX_COMPONENT_ARCHIVE), pins)
    destination = COMPONENT / "source"
    ordinary_ancestors(destination)
    if args.package:
        output = package_source(destination, pins, manifest, inventory, lock_raw)
        print(
            json.dumps(
                {"packaged": True, "filename": output.name, "networkUsed": False}
            )
        )
        return
    if args.verify or destination.exists():
        require(destination.is_dir(), "Prepare source first")
        count = verify_source(destination, inventory, manifest, lock_raw)
        output = COMPONENT / COMPONENT_FILENAME
        if output.exists() or output.is_symlink():
            verify_component_tar(read_regular(output, MAX_COMPONENT_ARCHIVE), pins)
        print(
            json.dumps(
                {
                    "prepared": True,
                    "verifiedCoreFiles": count,
                    "version": VARIANT_VERSION,
                    "networkUsed": False,
                }
            )
        )
        return
    if args.archive is not None:
        raw = read_regular(args.archive, MAX_ARCHIVE)
    else:
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect()
        )
        with opener.open(
            urllib.request.Request(
                UPSTREAM_URL,
                headers={"User-Agent": "NodeRED-Metadata-Workbench-source-setup"},
            ),
            timeout=60,
        ) as response:
            require(response.geturl() == UPSTREAM_URL, "Source authority changed")
            raw = response.read(MAX_ARCHIVE + 1)
    verify_archive(raw, pins)
    core = parse_core(raw)
    require(
        {name: {"bytes": len(data), "sha256": sha(data)} for name, data in core.items()}
        == inventory,
        "Verified archive core differs from the reviewed inventory",
    )
    core["package.json"] = encoded(manifest)
    core["package-lock.json"] = lock_raw
    destination.mkdir()
    for name, data in core.items():
        file = destination.joinpath(*PurePosixPath(name).parts)
        file.parent.mkdir(parents=True, exist_ok=True)
        with file.open("xb") as stream:
            stream.write(data)
    count = verify_source(destination, inventory, manifest, lock_raw)
    print(
        json.dumps(
            {
                "prepared": True,
                "verifiedCoreFiles": count,
                "version": VARIANT_VERSION,
                "networkUsed": args.download,
            }
        )
    )


if __name__ == "__main__":
    main()
