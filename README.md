# photo_feed

## Synology NAS OS

Synology NAS runs **DSM (DiskStation Manager)**, which is a **Linux-based** operating system.

## DSM Version and Package Availability

Some Synology packages depend on the **NAS model** and **DSM version**.
- Package availability can differ between DSM releases.
- Official packages such as Node.js or Docker may be available in Package Center on some models and DSM versions, but not all.
- Some software, such as MongoDB, may require a third-party package or a container-based setup instead of an official package.

When in doubt, check the model-specific Package Center support first.

## Deployment Decision Gate (Synology NAS 1GB RAM)

Default deployment is **bare process first** (run app directly on NAS).
Use Docker only when measured operational benefits are greater than RAM overhead.

### Phase 1: Bare process (required first)
- Lower memory overhead
- Simpler file I/O for uploads and thumbnails
- Easier debugging on low-resource NAS

### Move to Docker only if at least 2 are true
1. You need reproducible environment across multiple machines
2. You need safer rollback/version pinning
3. You need stronger dependency isolation
4. Peak RAM remains stable in load tests after container overhead

### Decision rule
If swap usage grows or memory pressure appears, stay with bare process.
Adopt Docker only after benchmarking confirms clear operational gains.

## Build and Serve

### Build
1. Install Node.js dependencies for the backend and frontend.
2. Build the frontend assets if the UI uses a bundler.
3. Prepare the upload and thumbnail directories on the NAS.

### Serve
1. Start the app directly on the NAS as a bare process.
2. Run the Node.js server with the production entry file.
3. Keep originals and thumbnails on persistent NAS storage.
4. Use DSM or a reverse proxy only if you need external access or TLS.

## Synology Packages and Shell Installation

If you need to install Synology packages from the Linux shell, use SSH and `synopkg`.

### Basic flow
1. Enable SSH in DSM.
2. Connect to the NAS with SSH.
3. Switch to an admin or root shell if needed.
4. Use `synopkg` to list, install, start, or stop packages.

### Common commands
```bash
synopkg list
synopkg install /path/to/package.spk
synopkg start <package-name>
synopkg stop <package-name>
synopkg status <package-name>
```

### Notes
- Use the Package Center when the package is officially supported there.
- Use `synopkg install` for local `.spk` files when you already have a supported package.
- For packages not officially supported on your DSM/model, prefer a bare-process install or Docker if it meets your memory budget.
