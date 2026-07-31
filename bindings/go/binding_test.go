package tree_sitter_flix_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_flix "github.com/wstein/tree-sitter-flix/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_flix.Language())
	if language == nil {
		t.Errorf("Error loading Flix grammar")
	}
}
