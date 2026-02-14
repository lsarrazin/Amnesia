# Amnesia

Firefox extension to fetch page links, then display last visit date and number of views.

Work in progress.

# Deployment

## Debugging

Note: execution limited to current firefox execution

From Firefox:
`about:debugging`
On the left:
`This Firefox`
Main panel:
`Load temporary add-on...` button
and select `manifest.json` file

## Packaging

Using `web-ext`:
from extension code folder
`web-ext build`
`web-ext sign`
will produce the extension `.xpi` file.

