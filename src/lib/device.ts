export function parseUserAgent(ua: string) {
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Desconhecido";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Desconhecido";
  const device = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android.*Mobile/.test(ua) ? "Celular Android"
    : /Android/.test(ua) ? "Tablet Android" : /Macintosh/.test(ua) ? "MacBook / Mac" : /Windows/.test(ua) ? "Laptop/Desktop Windows" : "Desktop";
  return { os, browser, device };
}
