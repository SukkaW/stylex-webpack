/*
 * This is a noop file specifically for Next.js app dir
 *
 * This has to be an actual file as webpack requires a file to exist on disk
 *
 * Due to how Next.js stupidly handles server code and client code in two different webpack namespaces,
 * the client compiler instance can't have access to the server code, including styles registered in the server code.
 *
 * In order for the client bundle to collect all the styles, we use this virtual noop file as a bridge. This file doesn't
 * do anything, but it will become a carrier, holding collected style rules. It is done by appending a fake import with
 * a url query using the "stylex-loader".
 *
 * Later in webpack's "processAsset" phase, we collect these imports from chunk information, extract those url query from
 * module identifiers, collect style rules for later CSS generation.
 */
