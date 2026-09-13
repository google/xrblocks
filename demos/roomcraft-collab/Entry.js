/** A launch alias for the shared editor, not a second Roomcraft application. */
export function roomcraftCollaborationUrl(value) {
  const source = new URL(value);
  const target = new URL(
    '../roomcraft/',
    new URL(source.pathname, source.origin)
  );
  target.searchParams.set('collab', '1');
  target.searchParams.set('lobby', '1');
  target.searchParams.set('transport', 'webrtc');
  for (const name of [
    'room',
    'name',
    'environment',
    'formFactor',
    'debug',
    'xrAutomation',
  ]) {
    if (source.searchParams.has(name)) {
      target.searchParams.set(name, source.searchParams.get(name));
    }
  }
  return target.href;
}

export function openRoomcraftCollaboration() {
  const target = roomcraftCollaborationUrl(window.location.href);
  document.getElementById('openRoomcraft').href = target;
  window.location.replace(target);
}
