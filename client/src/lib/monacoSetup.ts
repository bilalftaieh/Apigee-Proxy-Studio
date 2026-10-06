/**
 * Points @monaco-editor/react at a Monaco served from this machine, instead of
 * the one it downloads.
 *
 * WHY: left alone, @monaco-editor/loader injects a script tag for
 * `cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs` the moment the first
 * editor mounts. For a tool that otherwise talks only to 127.0.0.1 that was the
 * one thing standing between it and working on a plane: no network, no policy
 * editor, and the failure arrives as an editor that simply never appears. It
 * also pinned a *different* Monaco than the `monaco-editor` in package.json —
 * 0.55.1 at runtime against the 0.56 typings the app compiles against, a
 * mismatch nothing would report until an API moved underneath it.
 *
 * WHY A PATH AND NOT `loader.config({ monaco })`: handing the loader a bundled
 * instance is the other documented escape hatch, and it works — but it drags
 * all of Monaco through Rollup on every build. Measured on this repo: the full
 * build goes 4.5s -> 45s and the watcher's incremental rebuild 2.0s -> 7s,
 * because Vite is re-bundling and re-minifying 4.6mb of editor to produce a
 * file that only ever travels over loopback. `min/vs` is the same bundle
 * Microsoft already built and the CDN already served, workers and all, so
 * pointing at it on disk is a like-for-like swap that leaves the build alone.
 *
 * The server mounts it at /vs (see server/src/index.js); `npm run dev` proxies
 * /vs to the API port alongside /api (see vite.config.ts). Relative, so it
 * follows whatever host and port the app is actually on.
 */

import { loader } from '@monaco-editor/react';

loader.config({ paths: { vs: '/vs' } });
