[`weekly.js`](weekly.js) is a script that helps my weekly GTD review.

[![asciicast](https://asciinema.org/a/joY4R0pPLKVGxlhdMwgbVAHqc.png)](https://asciinema.org/a/joY4R0pPLKVGxlhdMwgbVAHqc)

# Installation

    npm install -g {github repo url}

Prefix with sudo if necessary.

# Running

    > weekly.js

# Prerequisites

You need taskwarrior and taskserver installed.

# Configuraton

weekly.js accepts configuration using environment variables :

* `WEEKLYJS_OLD_COLUMNS` : don't use new columns report features to ensure compatibility with old systems. See related [issue](https://github.com/abesto/gtd/issues/2).

