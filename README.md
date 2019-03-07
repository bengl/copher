
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

Copher also supports [S/Gopher][], allowing for TLS-encrypted gopher sessions.
This may be triggered using `gophers` instead of `gopher` in URLs, or by adding
100000 to the port, either in a URL or in a Gopher menu entry.

## Known Issues

There is a bug that causes a "back" (via left arrow key) to navigate from the
initial page to a blank page lacking the ability to move forward again. This is
fixed by using Chrome Canary. You can specify which Chrome binary to use by
setting the `CHROME_PATH` environment variable.

## License

The MIT License. See LICENSE.txt.

[gopher]: https://en.wikipedia.org/wiki/Gopher_(protocol)
[carlo]: https://github.com/GoogleChromeLabs/carlo
[RFC 1436]: https://www.ietf.org/rfc/rfc1436.txt
[S/Gopher]: https://gopher.floodgap.com/gopher/gw?a=gopher%3A%2F%2Fgopher.umbrellix.net%2F
