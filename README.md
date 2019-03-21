
# copher

![screenshot](./screenshot.png)

**copher** is a desktop GUI [gopher][] client powered by [carlo][].

## Usage

> **Note:** Chrome or Chromium must be installed.

Install with npm:

    $ npm i -g copher

Then run, optionally passing in a gopher URL (defaults to
`gopher://gopher.floodgap.com`):

    $ copher [url]

Alternatively, use npx:

    $ npx copher [url]

To navigate, click on the blue links on the left. You can go back and forward by
using the left and right arrow keys. You can select a new URL to navigate to by
pressing the `g` key.

HTML/web links and Telnet links will open in the system default applications.
Images, sound and text files will open as a new page in copher. All other file
types are downloaded to disk using Chrome's downloader.

By default, connections will time out after 5 seconds. You can configure the
timeout, in milliseconds, by setting the `--timeout` option.

## Gopher Protocol Support

An effort is made to support all of [RFC 1436][], except for CSO (item type
`2`).

The following commonly used item-type extensions are supported:

* **`i`** - Non-link text appearing in a Gopher menu.
* **`p`** - Specifically represents PNG images. These are rendered as other
  images are.
* **`h`** - Items of this type whose selector is of the form
  `URL:http://example.com/foo.html` will open in the default browser.
* **`s`** - Sound files are opened in Copher with audio player controls.
* **`d`** - Downloadable files.
* **`P`** - PDF files. These are downloaded like other downloadable files.

If copher does not recognize an item type, it will be treated as a downloadable
file.

Copher also supports [S/Gopher][], allowing for TLS-encrypted gopher sessions.
This may be triggered using `gophers` instead of `gopher` in URLs, or by adding
100000 to the port, either in a URL or in a Gopher menu entry.

While [RFC 1436][] states that all text must be ASCII or Latin1, UTF-8 appears
to be more prevalant on Gopher servers today, so Copher will interpret text as
UTF-8 by default. This can be changed via the `--encoding` option.
[`iconv-lite`][] is used to convert from various encodings to UTF-8 for
rendering. For example, to parse all incoming text as Latin1, try:

    $ copher --encoding latin1

## Gopher-over-HTTPS Support

[Gopher-over-HTTPS][] is supported by passing a [URL template][] to the `--goh`
option. The template must contain a variable named `url` and the protocol must
be `https:`. Technically HTTP would also work fine, but it is called
Gopher-over-HTTPS, after all!

Example:

    $ copher --goh https://goh.commons.host:7070/{?url} gopher://gopher.club

When this is enabled, all traffic will be tunneled over HTTPS through the server
at the URL provided, assuming that the HTTPS server is GoH compliant.

Note that when this is enabled, S/Gopher will not work correctly.

## Customization

You can provide a `--userjs` option, passing in an absolute path to a JS file.
This file will be inserted inline in a `<script>` tag. There's no extra API
provided, but you can use this to change styles or trigger or handle events, or
any number of UI-changing things. The current version of copher is provided as
`window.copherVersion`, in order to deal with any version-to-version
differences.

> **WARNING:** Do **not** blindly accept scripts from other random folks on the
> internet to include in your `--userjs` file. While Copher runs inside
> Chromium and in its own Chrome profile, there's no telling what *other* damage
> a script may do. Be diligent and review every line of code you add.

## Known Issues

There is a bug that causes a "back" (via left arrow key) to navigate from the
initial page to a blank page lacking the ability to move forward again. This is
fixed by using Chrome Canary. You can specify which Chrome binary to use by
setting the `CHROME_PATH` environment variable.

## License

The MIT License. See LICENSE.txt.

[gopher]: https://en.wikipedia.org/wiki/Gopher_(protocol)
[carlo]: https://github.com/GoogleChromeLabs/carlo
[RFC 1436]: https://tools.ietf.org/html/rfc1436
[S/Gopher]: https://gopher.floodgap.com/gopher/gw?a=gopher%3A%2F%2Fgopher.umbrellix.net%2F
[`iconv-lite`]: https://npmjs.com/package/iconv-lite
[Gopher-over-HTTPS]: https://gitlab.com/commonshost/goh#gopher-over-https-goh
[URL Template]: https://tools.ietf.org/html/rfc6570
