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
#
# NOTE: a full Flix checkout contains two files that are expected to fail —
# main/test/flix/resiliency/ford-fulkerson-prefix.flix (a negative test,
# truncated mid-expression) and examples/apps/langcensus/src/Analyse.flix (uses
# `foreach (...) yield`, which the reference parser rejects too). This script
# has no way to know that, so it reports them as failures. Two failures with
# those names is the expected result for a full checkout, and means every valid
# file parsed.

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
# `set -e` would abort here the moment any file fails to parse, which is the
# normal case for a corpus containing negative tests -- and it would skip the
# marker pass below entirely, silently disabling it.
parse_status=0
tree-sitter parse --quiet --stat --paths "$paths" || parse_status=$?

# The grammar models two of the reference's own error markers as real nodes --
# `unterminated_literal` and `trailing_dot` -- because Parser2 builds them and
# keeps going rather than failing outright. That is deliberate (this grammar
# follows the parser, not the weeder), but it means such a file contains no
# ERROR node, so the tally above counts it as a clean parse.
#
# Without this second pass the gate silently weakens: adding trailing_dot made
# main/test/flix/resiliency/ford-fulkerson-prefix.flix -- truncated at
# `let g4 = FordFulkerson.`, a negative test that must not parse -- start
# reporting as success. An error marker is a failure here even though
# tree-sitter is content.
markers=$(mktemp)
flagged=$(mktemp)
trap 'rm -f "$paths" "$markers" "$flagged"' EXIT
printf '[(unterminated_literal) (unterminated_string) (trailing_dot)] @marker\n' > "$markers"

# `tree-sitter query` prints every file it visited, matched or not, with any
# captures indented beneath. Only a file followed by a capture actually contains
# a marker, so pair them up rather than counting file lines.
tree-sitter query --paths "$paths" "$markers" 2>/dev/null | awk '
    /^[^[:space:]]/ { file = $0; next }
    /capture:/ && file != "" { print file; file = "" }
' | sort -u > "$flagged"

count=$(wc -l < "$flagged" | tr -d ' ')
if [ "$count" -gt 0 ]; then
    echo
    echo "$count file(s) parsed without an ERROR node but contain an explicit error marker:"
    sed 's/^/    /' "$flagged"
    exit 1
fi

exit $parse_status
