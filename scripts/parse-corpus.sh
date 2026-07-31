#!/bin/sh
# Parse a tree of real .flix sources and report how many files parse cleanly.
#
# The Flix compiler checkout is the reference corpus: it contains the standard
# library and the official examples, which together exercise nearly all of the
# surface syntax. Point FLIX_SRC at a checkout of https://github.com/flix/flix
# (or pass the directory as the first argument).
#
# Usage:
#   scripts/parse-corpus.sh [directory]
#   FLIX_SRC=~/src/flix scripts/parse-corpus.sh
#
# Exits non-zero if any file fails to parse, so it can gate a release.

set -eu

corpus=${1:-${FLIX_SRC:-}}

if [ -z "$corpus" ]; then
    echo "error: no corpus directory given; pass one as \$1 or set FLIX_SRC" >&2
    exit 2
fi

if [ ! -d "$corpus" ]; then
    echo "error: not a directory: $corpus" >&2
    exit 2
fi

paths=$(mktemp)
trap 'rm -f "$paths"' EXIT

find "$corpus" -name '*.flix' -type f > "$paths"

count=$(wc -l < "$paths" | tr -d ' ')
if [ "$count" -eq 0 ]; then
    echo "error: no .flix files found under $corpus" >&2
    exit 2
fi

echo "parsing $count files from $corpus"

# Deliberately no `tree-sitter generate` here: src/parser.c is committed, and
# regenerating takes ~10 minutes. Run it yourself after editing grammar.js.
#
# tree-sitter parse exits non-zero when any file contains an ERROR node.
# --quiet suppresses the parse trees; --stat prints the success/failure tally.
tree-sitter parse --quiet --stat --paths "$paths"
