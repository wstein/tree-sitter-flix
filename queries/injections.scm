; Regex literals are java.util.regex patterns — `Weeder2` compiles them with
; Pattern.compile after escape decoding.
((regex) @injection.content
  (#set! injection.language "regex"))

; Flix doc comments are markdown; HtmlDocumentor and MarkdownDocumentor both
; render them as such.
((doc_comment) @injection.content
  (#set! injection.language "markdown")
  (#set! injection.combined))
