// Reads (and controls) whatever macOS considers "now playing", the same thing the media keys talk to.
// Loaded into /usr/bin/perl, which Apple's MediaRemote still talks to; see media/system.py. Output: one JSON line.
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <CoreFoundation/CoreFoundation.h>
#include <dispatch/dispatch.h>
typedef void (^InfoCB)(CFDictionaryRef);
typedef void (^BoolCB)(Boolean);
static void *H(void) { static void *h; if (!h) h = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_LAZY); return h; }
static void esc(const char *s) { putchar('"'); for (; *s; s++) { if (*s == '"' || *s == '\\') { putchar('\\'); putchar(*s); } else if ((unsigned char)*s < 32) putchar(' '); else putchar(*s); } putchar('"'); }
static CFTypeRef get(CFDictionaryRef d, const char *k) { CFStringRef key = CFStringCreateWithCString(0, k, kCFStringEncodingUTF8); CFTypeRef v = CFDictionaryGetValue(d, key); CFRelease(key); return v; }
static void str(CFDictionaryRef d, const char *k, const char *name, int *first) {
  CFTypeRef v = get(d, k);
  if (v && CFGetTypeID(v) == CFStringGetTypeID()) { char b[1024]; CFStringGetCString(v, b, sizeof b, kCFStringEncodingUTF8); printf("%s\"%s\":", *first ? "" : ",", name); esc(b); *first = 0; }
}
static void num(CFDictionaryRef d, const char *k, const char *name, int *first) {
  CFTypeRef v = get(d, k);
  if (v && CFGetTypeID(v) == CFNumberGetTypeID()) { double x = 0; CFNumberGetValue(v, kCFNumberDoubleType, &x); printf("%s\"%s\":%g", *first ? "" : ",", name, x); *first = 0; }
}
void mr_run(void) {
  const char *cmd = getenv("MR_CMD");
  if (cmd) { Boolean (*send)(int, CFDictionaryRef) = dlsym(H(), "MRMediaRemoteSendCommand"); if (send) send(atoi(cmd), NULL); printf("{}\n"); return; }
  void (*getInfo)(dispatch_queue_t, InfoCB) = dlsym(H(), "MRMediaRemoteGetNowPlayingInfo");
  void (*isPlaying)(dispatch_queue_t, BoolCB) = dlsym(H(), "MRMediaRemoteGetNowPlayingApplicationIsPlaying");
  if (!getInfo) { printf("{\"error\":\"unavailable\"}\n"); return; }
  __block Boolean playing = 0;
  dispatch_semaphore_t s = dispatch_semaphore_create(0);
  if (isPlaying) { isPlaying(dispatch_get_global_queue(0, 0), ^(Boolean p) { playing = p; dispatch_semaphore_signal(s); }); dispatch_semaphore_wait(s, dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC)); }
  static char appbuf[256]; appbuf[0] = 0; char *app = appbuf;
  void (*getApp)(dispatch_queue_t, void (^)(CFStringRef)) = dlsym(H(), "MRMediaRemoteGetNowPlayingApplicationDisplayID");
  if (getApp) {
    getApp(dispatch_get_global_queue(0, 0), ^(CFStringRef b) { if (b) CFStringGetCString(b, app, 256, kCFStringEncodingUTF8); dispatch_semaphore_signal(s); });
    dispatch_semaphore_wait(s, dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC));
  }
  __block int done = 0;
  getInfo(dispatch_get_global_queue(0, 0), ^(CFDictionaryRef d) {
    int f = 1; printf("{");
    if (d) {
      str(d, "kMRMediaRemoteNowPlayingInfoTitle", "title", &f); str(d, "kMRMediaRemoteNowPlayingInfoArtist", "artist", &f); str(d, "kMRMediaRemoteNowPlayingInfoAlbum", "album", &f);
      num(d, "kMRMediaRemoteNowPlayingInfoDuration", "duration", &f); num(d, "kMRMediaRemoteNowPlayingInfoElapsedTime", "elapsed", &f); num(d, "kMRMediaRemoteNowPlayingInfoPlaybackRate", "rate", &f);
      CFTypeRef ts = get(d, "kMRMediaRemoteNowPlayingInfoTimestamp");
      if (ts && CFGetTypeID(ts) == CFDateGetTypeID()) { printf("%s\"ts\":%.2f", f ? "" : ",", CFDateGetAbsoluteTime(ts) + kCFAbsoluteTimeIntervalSince1970); f = 0; }
      CFTypeRef art = get(d, "kMRMediaRemoteNowPlayingInfoArtworkData"); const char *path = getenv("MR_ART");
      if (art && path && CFGetTypeID(art) == CFDataGetTypeID()) { FILE *fp = fopen(path, "wb"); if (fp) { fwrite(CFDataGetBytePtr(art), 1, CFDataGetLength(art), fp); fclose(fp); printf("%s\"art\":true", f ? "" : ","); f = 0; } }
    }
    if (app[0]) { printf("%s\"app\":", f ? "" : ","); esc(app); f = 0; }
    printf("%s\"playing\":%s}\n", f ? "" : ",", playing ? "true" : "false"); fflush(stdout); done = 1; dispatch_semaphore_signal(s);
  });
  dispatch_semaphore_wait(s, dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC));
  if (!done) printf("{\"error\":\"timeout\"}\n");
}
