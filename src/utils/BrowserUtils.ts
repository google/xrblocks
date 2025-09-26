export function onDesktopUserAgent() {
  return !(/Mobi|Linux|Android|iPhone/i.test(navigator.userAgent));
}
