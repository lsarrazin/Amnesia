
# Amnesia ![Amnsia](/ressources/dory64.png) 

Firefox extension to fetch page links, then display last visit date and number of views.

Work in progress.

# Deployment

## Debugging

🔔 **Note:** execution limited to current firefox execution

From Firefox:

`about:debugging`

On the left:

`This Firefox`

Main panel:

`Load temporary add-on...` button

and select `manifest.json` file

## Packaging

### Hand-made:
```
zip -r -FS ../amnesia.xpi * --exclude '*.git*' --exclude '*.md' --exclude 'LICENSE'
```
and submit the extension to Firefox AMO

### Using `web-ext` (unverified):

from extension code folder
```
web-ext build --overwrite-dest
```

This will produce the extension `.xpi` file.

