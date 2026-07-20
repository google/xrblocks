function relativePath(url, baseDirectory) {
    if (url.origin !== baseDirectory.origin)
        return url.href;
    const from = baseDirectory.pathname.split('/').filter(Boolean);
    const to = url.pathname.split('/').filter(Boolean);
    while (from.length > 0 && to.length > 0 && from[0] === to[0]) {
        from.shift();
        to.shift();
    }
    const path = `${'../'.repeat(from.length)}${to.join('/')}` || './';
    return `${path}${url.search}${url.hash}`;
}
function portablePath(path, baseDirectory) {
    return path
        ? relativePath(new URL(path, document.baseURI), baseDirectory)
        : undefined;
}
/** Builds a strict simulator manifest from the active environment and the
 * editor's current asset-backed objects. */
function serializeActiveManifest(manifest, sceneManager, scenesDir) {
    const baseDirectory = new URL(scenesDir, document.baseURI);
    const objects = sceneManager.list().map((instance) => ({
        id: instance.id,
        assetPath: portablePath(instance.assetPath, baseDirectory),
        position: instance.object.position.toArray(),
        quaternion: instance.object.quaternion.toArray(),
        scale: instance.object.scale.toArray(),
        visible: instance.object.visible,
        detectObject: instance.definition.detectObject,
        label: instance.definition.label,
        data: instance.definition.data,
        physics: instance.definition.physics,
    }));
    return {
        name: manifest.name,
        scenePath: portablePath(manifest.scenePath, baseDirectory),
        videoPath: portablePath(manifest.videoPath, baseDirectory),
        scenePlanesPath: portablePath(manifest.scenePlanesPath, baseDirectory),
        navMeshPath: portablePath(manifest.navMeshPath, baseDirectory),
        position: manifest.position,
        quaternion: manifest.quaternion,
        scale: manifest.scale,
        objects,
    };
}

export { serializeActiveManifest };
